---
title: Porting Verlet Rope Physics to a Minecraft 1.20.1 Fabric Mod
date: 2025-02-10
tags: [java, minecraft, modding, physics]
excerpt: Swing mechanics, UV mapping an 8×16 rope texture, and fixing mixin callback types — notes from building the rope system for the Sync mod.
---

# Porting Verlet Rope Physics to a Minecraft 1.20.1 Fabric Mod

The Sync mod for Minecraft 1.20.1 needed rope physics. Not fake "connect two points with a straight line" rope — *actual* physics where the rope swings, hangs with realistic sag, and responds to the player's momentum. The reference implementation existed for 1.21.1 in Finn's Origins, so theoretically it was just a port.

It took three weeks.

---

## What Verlet Integration Is

Verlet integration is a numerical method for simulating particle motion. Instead of tracking position *and* velocity separately, you store the current position and the *previous* position. Velocity is implicit — it's the difference between them.

For a rope made of `n` particles:

```java
for (int i = 0; i < particles.length; i++) {
    Vec3 current = particles[i].pos;
    Vec3 previous = particles[i].prevPos;

    // velocity = current - previous (implicit)
    Vec3 velocity = current.subtract(previous);

    // apply gravity
    velocity = velocity.add(0, -GRAVITY * dt * dt, 0);

    particles[i].prevPos = current;
    particles[i].pos = current.add(velocity);
}
```

Then a constraint-solving pass runs several times per tick to maintain segment lengths:

```java
for (int iter = 0; iter < ITERATIONS; iter++) {
    for (int i = 0; i < segments; i++) {
        Vec3 a = particles[i].pos;
        Vec3 b = particles[i + 1].pos;
        Vec3 delta = b.subtract(a);
        double dist = delta.length();
        double error = (dist - SEGMENT_LENGTH) / dist;
        Vec3 correction = delta.scale(0.5 * error);

        if (i > 0) particles[i].pos = a.add(correction);
        particles[i + 1].pos = b.subtract(correction);
    }
}
```

More iterations = stiffer rope. The top particle is pinned to an anchor point. The bottom particle follows the player (or hangs free).

---

## The Swing Momentum Problem

The first version of the port had ropes that felt wrong. They moved, they sagged, but swinging felt floaty — like moving through honey. The problem was that I was clamping the player's horizontal velocity when attached to a rope, which killed the momentum transfer.

The fix was counterintuitive: *add* velocity rather than clamp it.

```java
// Wrong: clamp velocity to max swing speed
double speed = horizontalVel.length();
if (speed > MAX_SWING_SPEED) {
    horizontalVel = horizontalVel.normalize().scale(MAX_SWING_SPEED);
}

// Right: let physics carry momentum, only apply drag
horizontalVel = horizontalVel.scale(0.98); // 2% drag per tick
```

The pendulum equation says the period of a pendulum depends only on its length, not the mass or starting velocity. The player should feel like a pendulum weight, not a character who happens to be attached to a rope. Once I stopped fighting the velocity, the swing felt right.

---

## Rope Length Controls

Players needed to be able to extend or retract the rope. The naive approach — add or remove particles from the array — creates stuttering because you're discontinuously changing the constraint topology.

The better approach is to keep a fixed number of particles and change the `SEGMENT_LENGTH` value instead. Longer segments = longer rope, same particle count:

```java
// On scroll wheel / key input
void adjustRopeLength(float delta) {
    targetLength = Math.clamp(
        targetLength + delta,
        MIN_ROPE_LENGTH,
        MAX_ROPE_LENGTH
    );
    // smoothly interpolate segment length
    segmentLength = MathHelper.lerp(0.15f, segmentLength, targetLength / PARTICLE_COUNT);
}
```

The `lerp` smooths the transition so the rope gradually extends or retracts rather than snapping.

---

## Mixin Callback Type Errors

Mixins in Fabric let you inject code into Minecraft's classes. Getting the callback type wrong gives you cryptic crashes at runtime.

The specific error I hit was using `CallbackInfo` where `CallbackInfoReturnable<Boolean>` was needed. The method I was injecting into returned a `boolean`, so the mixin framework needed the returnable variant:

```java
// Wrong
@Inject(method = "canSwim", at = @At("RETURN"))
private void onCanSwim(CallbackInfo ci) { ... }

// Right
@Inject(method = "canSwim", at = @At("RETURN"))
private void onCanSwim(CallbackInfoReturnable<Boolean> cir) {
    if (isRopeAttached) cir.setReturnValue(false);
}
```

The rule: if the method returns anything other than `void`, use `CallbackInfoReturnable<T>` where `T` is the boxed return type.

---

## Lightmap Coordinate Types

The rope renderer needed to sample the lightmap at the rope's position to shade it correctly. In 1.20.1, lightmap coordinates changed from `int` to a packed format accessed differently than in earlier versions.

The old way (from 1.21.1 code I was porting from):

```java
int light = worldRenderer.getLightmapCoordinates(world, pos);
```

The 1.20.1 way requires going through `LightmapTextureManager`:

```java
int packedLight = LightmapTextureManager.pack(
    world.getLightLevel(LightType.BLOCK, pos),
    world.getLightLevel(LightType.SKY, pos)
);
```

The symptom when this is wrong: the rope renders pitch black regardless of lighting conditions, because you're feeding garbage light values to the shader.

---

## UV Mapping the 8×16 Rope Texture

The rope uses a custom texture: 8 pixels wide, 16 pixels tall. Each horizontal slice represents a different "rotation" of the rope's twist pattern to give the illusion of a braided rope twisting as it swings.

The UV calculation for a given point along the rope:

```java
float u = (ropeAngle % (2 * Math.PI)) / (2 * Math.PI);  // 0-1 based on twist
float vTop = segmentIndex / (float) totalSegments;
float vBot = (segmentIndex + 1) / (float) totalSegments;

// Map to texture coordinates
float texU = u;              // horizontal = twist rotation
float texV = vTop;           // vertical = position along rope
```

The texture itself needs to tile horizontally — the left edge and right edge should match — so the twist pattern looks continuous as the u coordinate wraps. I painted it in Aseprite, treating it like a seamless tiling texture.

---

## Current Status

The rope system is in the Sync mod at roughly 65% completion. What works:

- Verlet integration with configurable segment count
- Anchor detection (blocks, entities)
- Swing momentum with drag
- Length controls
- Basic lighting via lightmap sampling

What still needs work:

- Rope-to-rope interactions (two ropes tangling)
- Player collision with the rope itself
- Network sync for multiplayer (other players don't see the rope yet)
- Rope breaking under load (max tension threshold)

The mod is on Modrinth and the source is on GitHub at [0vergrown/Sync](https://github.com/0vergrown/Sync). The rope system is in the `feature/rope-physics` branch.

---

*The most frustrating bugs in modding are always the type system ones. The physics is hard to get feeling right, but at least physics bugs are visible. A wrong generic type parameter just silently breaks at runtime with a stack trace that doesn't tell you anything useful.*
