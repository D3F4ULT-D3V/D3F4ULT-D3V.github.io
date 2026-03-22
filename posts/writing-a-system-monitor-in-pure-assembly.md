---
title: Writing a System Monitor in Pure x86_64 Assembly
date: 2025-01-15
tags: [assembly, linux, systems]
excerpt: No libc. No C runtime. Just NASM, raw syscalls, and /proc. A deep dive into Assembly-Sysmon.
---

# Writing a System Monitor in Pure x86_64 Assembly

There's a specific kind of satisfaction that comes from making a computer do exactly what you tell it — no abstractions between you and the hardware, no runtime holding your hand. **Assembly-Sysmon** started as a proof of concept: *can I read CPU, memory, load, and network stats entirely in NASM, using nothing but Linux syscalls?*

The answer is yes. And it was worth every hour of debugging.

---

## Why Assembly?

I'm not going to pretend it's the practical choice. You could write this in 20 lines of Python or a single Go binary. But I was learning x86_64 and I wanted a real project,something that actually *does something* and not just toy programs that print "Hello, World."

A system monitor hits a nice sweet spot:
- It has real I/O (reading from `/proc`)
- It requires string parsing (without `atoi` or `sscanf`)
- It needs to loop indefinitely and refresh
- It produces visible, useful output

Plus the aesthetic of a black terminal with color-coded threat levels felt right at home.

---

## The Architecture

The whole program lives in a single `.asm` file assembled with NASM and linked directly with `ld` — no libc, no startup code, no `_init`.

```nasm
bits 64

%define SYS_READ      0
%define SYS_WRITE     1
%define SYS_OPEN      2
%define SYS_CLOSE     3
%define SYS_NANOSLEEP 35
%define SYS_EXIT      60
%define STDOUT        1
%define BUFSZ         8192
```

That's all the infrastructure. Five syscall numbers and a buffer size. Everything else is manual.

The main loop is dead simple:

1. Clear the screen with ANSI escape sequences
2. Read and display CPU info from `/proc/cpuinfo`
3. Read and display memory stats from `/proc/meminfo`
4. Read and display load averages from `/proc/loadavg`
5. Read and display network stats from `/proc/net/dev`
6. Calculate a threat score
7. Sleep 3 seconds via `nanosleep`
8. Jump back to step 1

---

## Reading Files Without libc

The trickiest part early on was realizing you can't just call `fopen`. You're working with raw kernel interfaces:

```nasm
rdfile:
    ; open(path, O_RDONLY=0, 0)
    mov  rax, SYS_OPEN
    xor  rsi, rsi       ; O_RDONLY = 0
    xor  rdx, rdx
    syscall
    test rax, rax
    js   .error         ; negative return = error

    mov  rbx, rax       ; save file descriptor

    ; read(fd, fbuf, BUFSZ-1)
    mov  rax, SYS_READ
    mov  rdi, rbx
    mov  rsi, fbuf
    mov  rdx, BUFSZ - 1
    syscall
```

`SYS_OPEN` returns a file descriptor (a small integer, usually 3+) in `rax`, or a negative errno if it fails. Then `SYS_READ` dumps up to `BUFSZ-1` bytes into your buffer. Simple — but you have to track the fd, null-terminate the buffer yourself, and close it when done.

One footgun: on Linux x86_64, syscall arguments go in `rdi, rsi, rdx, r10, r8, r9` in that order. The syscall number goes in `rax`. If you've used 32-bit Linux before, this is different — don't get them mixed up.

---

## String Parsing Without String Functions

This is where things get fun. `/proc/meminfo` looks like this:

```
MemTotal:       16234496 kB
MemFree:         3201024 kB
MemAvailable:    8765432 kB
...
```

I need to find `MemTotal:`, skip the whitespace, and parse the number. No `strstr`, no `strtol`. So I wrote them:

### `findstr` — substring search

```nasm
findstr:
    ; rdi = haystack, rsi = needle
    ; returns rax = ptr to match, or 0

    mov  rbx, rdi       ; outer scan position
.outer:
    cmp  byte [rbx], 0
    je   .notfound
    mov  rcx, rbx       ; compare position
    mov  rdx, rsi       ; needle position (reset)
.inner:
    cmp  byte [rdx], 0  ; end of needle? match!
    je   .found
    mov  r8b, [rcx]
    cmp  r8b, [rdx]
    jne  .advance
    inc  rcx
    inc  rdx
    jmp  .inner
.advance:
    inc  rbx
    jmp  .outer
```

### `parsuint` — decimal string to integer

```nasm
parsuint:
    ; rsi = pointer into digit string
    ; returns rax = parsed value, rsi advanced past digits
    xor  rax, rax
.loop:
    movzx rcx, byte [rsi]
    sub  rcx, '0'       ; '0' = 48 decimal
    js   .done          ; below '0' — stop
    cmp  rcx, 9
    ja   .done          ; above '9' — stop
    imul rax, rax, 10
    add  rax, rcx
    inc  rsi
    jmp  .loop
```

It's tedious but satisfying. Once you've written these primitives, parsing any `/proc` file becomes mechanical.

---

## The Threat Score System

This is my favorite part — it's a simple heuristic but it *feels* real.

Two checks run every refresh cycle:

| Check | Condition | Points Added |
|-------|-----------|-------------|
| Memory pressure | Usage > 80% | +1 |
| Elevated load | 1-min avg > 3.0 | +1 |
| Critical load | 1-min avg > 8.0 | +2 (replaces +1) |

The score maps to four states:

- `[0] CLEAN` — green, everything nominal
- `[1] LOW` — yellow, keep watching
- `[2] MEDIUM` — yellow, investigate
- `[3+] HIGH` — red, **act now**

Because the whole program is a single `.bss` section with no heap, the score lives in a named memory location:

```nasm
section .bss
v_threat    resq 1    ; accumulated threat score
v_mempct    resq 1    ; memory usage percentage
v_load_lvl  resb 1    ; 0=ok, 1=med, 2=high
```

`resq 1` reserves 8 bytes (a qword). `resb 1` reserves one byte. All zeroed at startup automatically.

---

## Printing Numbers

There's no `printf`. To print a number I have to convert it to a decimal string myself, right-to-left in a scratch buffer:

```nasm
prnuint:
    ; rdi = value to print
    lea  rbx, [nbuf + 31]   ; start at end of buffer
    mov  byte [rbx], 0       ; null terminator

    test rax, rax
    jnz  .convert
    dec  rbx
    mov  byte [rbx], '0'    ; special case: zero
    jmp  .print

.convert:
    xor  rdx, rdx
    mov  rcx, 10
    div  rcx                 ; rdx = digit, rax = quotient
    add  dl, '0'
    dec  rbx
    mov  [rbx], dl
    test rax, rax
    jnz  .convert
```

Divide by 10, take the remainder as the next digit (from the right), repeat until the quotient is zero. Then print the portion of the buffer from the last-written byte onward.

---

## Lessons Learned

**Register discipline is everything.** Forget which register holds your file descriptor and you're closing the wrong fd, corrupting your read. I started writing calling conventions with explicit push/pop sequences for every function I cared about.

**The System V AMD64 ABI is your friend** — but you have to actually read it. Syscalls use different registers than function calls. `rax` is both the syscall number *and* the return value. `rcx` and `r11` are clobbered by the `syscall` instruction itself (it uses them to save `rip` and `rflags`).

**Debugging assembly is just `strace` and patience.** `strace ./sysmon` shows every syscall with its arguments and return values. If something is failing silently, strace will tell you.

**NASM labels are just addresses.** Coming from a language with functions, it's initially weird that nothing enforces call/ret symmetry. The CPU doesn't care. You can jump into the middle of a "function" if you want. This is a feature once you internalize it, but it requires discipline.

---

## What's Next

The immediate TODO list:

- Parse `/proc/net/dev` more carefully to extract per-interface RX/TX byte counts and display them in columnar format instead of just dumping the raw file
- Add process enumeration via `/proc/[pid]/status` — scan numeric directories under `/proc` to count running processes
- Track CPU usage across samples (requires storing previous `/proc/stat` values and calculating deltas)
- Maybe a mini TUI with `ioctl` to get terminal dimensions and draw boxes

The full source is on GitHub: [Assembly-Sysmon](https://github.com/D3F4ULT-D3V/Assembly-Sysmon)

Build instructions are dead simple:

```bash
nasm -f elf64 sysmon.asm -o sysmon.o
ld -o sysmon sysmon.o
./sysmon
```

No dependencies. No Makefile. Just NASM and `ld`.

---

*If you're curious about x86_64 assembly and want a project to learn with — pick something real. The frustration of not having string functions, the satisfaction of writing your own — that's the whole point.*
