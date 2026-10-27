<template>
  <PopupFrame ref="frame" title="Tutorial" :closable="!first" @close="$emit('close', progress())">
    <template #header>
      <nav class="steps" aria-label="Steps">
        <button v-for="step in STEPS" :key="step.id" @click="jump(step.id)">
          <span class="badge">{{ step.n }}</span>{{ step.name }}
        </button>
      </nav>
    </template>

    <div class="tutorial">
      <!-- intro -->
      <section class="intro">
        <h1>How to sketch an articulated object</h1>
        <p class="lead">
          On the left is a reference object with moving parts. On the right you
          build your own 3D sketch of it, in four steps. Each step is displayed
          with a short clip. The tutorial can be opened again at any time, and
          takes about 5 minutes to read in total.
        </p>
        <div class="step-cards">
          <button v-for="step in STEPS" :key="step.id" class="step-card" @click="jump(step.id)">
            <span class="card-head">
              <span class="card-name">{{ step.n }} · {{ step.name }}</span>
              <kbd>{{ step.key }}</kbd>
            </span>
            <span class="card-text">{{ step.summary }}</span>
          </button>
        </div>
      </section>

      <!-- the screen -->
      <section class="screen">
        <h2>The screen</h2>
        <div class="map" aria-hidden="true">
          <div class="map-ref">
            <div class="map-toggles"><span /><span /></div>
            <div class="map-label">Reference object</div>
            <div class="map-sliders"><span /><span /><span /></div>
            <span class="callout" style="top: 10px; right: 12px">1</span>
            <span class="callout" style="bottom: 14px; left: 206px">2</span>
          </div>
          <div class="map-sketch">
            <div class="map-tools">
              <span v-for="k in ['D', 'E', 'V', 'G', 'J', 'A']" :key="k" :class="{ on: k === 'D' }">{{ k }}</span>
            </div>
            <div class="map-canvas">
              <div class="map-topbar" />
              <div class="map-label">Your sketch</div>
            </div>
            <div class="map-panels">
              <span>Parts</span><span>Articulations</span><span>Poses</span>
            </div>
            <span class="callout" style="top: 140px; left: 44px">3</span>
            <span class="callout" style="top: 14px; left: 45%">4</span>
            <span class="callout" style="bottom: 104px; right: 52px">5</span>
          </div>
        </div>
        <ol class="legend">
          <li><strong>Reference.</strong> The object to sketch. Toggle part colours and joint arrows at the top.</li>
          <li><strong>Joint sliders.</strong> Move each of its joints, or press <em>Play all</em> to see everything move.</li>
          <li><strong>Tools.</strong> One tool at a time; press its key again to turn it off.</li>
          <li><strong>Tool options.</strong> Change with the tool: plane controls when drawing, axis buttons when rigging. Undo and View are always there.</li>
          <li><strong>Panels</strong> (bottom right). Your parts, joints and saved poses.</li>
        </ol>
      </section>

      <!-- moving the view -->
      <section class="view-box">
        <div>
          <h2>Moving the view</h2>
          <p>
            The same on both sides. The left mouse button always belongs to the
            tool, so it never moves the view by accident. A mouse with a scroll
            wheel works best.
          </p>
        </div>
        <table>
          <tr><td><kbd>Alt</kbd> + drag</td><td>Rotate around the object</td></tr>
          <tr><td><kbd>Space</kbd> + drag, or middle-drag</td><td>Pan</td></tr>
          <tr><td>Scroll wheel, or right-drag</td><td>Zoom</td></tr>
          <tr><td><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd></td><td>Undo / redo, at any step</td></tr>
        </table>
      </section>

      <!-- 1 sketch -->
      <section id="tutorial-sketch" class="step">
        <div class="step-head"><span class="big-badge">1</span><h2>Sketch</h2><kbd>D</kbd></div>
        <p class="step-lead">
          Draw the object in 3D. Every stroke lands on a see-through
          <strong>drawing plane</strong>, so working in 3D means moving the plane
          to where the next stroke should go, then drawing on it.
        </p>
        <div class="columns">
          <TutorialClip :src="CLIPS.sketch" label="1" caption="Turn the plane, draw on it, orbit to check.">
            Draw an outline on the plane, turn the plane to the side, draw the
            depth, then orbit to show it is really 3D.
          </TutorialClip>
          <div class="howto">
            <ol>
              <li>Press <strong>D</strong> and drag on the plane to draw.</li>
              <li>Face the plane <strong>front, side or top</strong> with the buttons above the sketch, or move and turn it with its gizmo: <strong>T</strong> move, <strong>R</strong> rotate, <strong>S</strong> scale. With <em>Snap</em> on it moves in tidy steps.</li>
              <li><strong>Orbit often</strong> (Alt + drag). A drawing can look right from one side and be flat from another.</li>
              <li><strong>E</strong> erases by dragging over strokes. <strong>V</strong> selects strokes so you can move them.</li>
            </ol>
            <div class="tips">
              <strong>Tips</strong>
              <span>Rough is fine. Outlines and the main shapes are enough; you don't need shading or detail.</span>
              <span>Before drawing each moving piece, click <strong>New part</strong> in the Parts panel. The new part is selected, so everything you draw next goes straight into it, and most of the next step is done for you.</span>
              <span><em>Guide</em> (top right) shows a faint box or outline of the reference to help with proportions.</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 2 segment -->
      <section id="tutorial-segment" class="step">
        <div class="step-head"><span class="big-badge">2</span><h2>Segment</h2><kbd>G</kbd></div>
        <p class="step-lead">
          Tell the sketch which strokes belong together. A <strong>part</strong>
          is a piece that moves as one: a desk lamp might be a base, a lower arm,
          an upper arm and a head. Each part gets its own colour.
        </p>
        <div class="columns">
          <TutorialClip :src="CLIPS.segment" label="2" caption="New part, then draw into it or sweep through strokes.">
            Click New part and draw the lamp head straight into it; then sweep
            the segment pen through the arm's strokes to sort them; then Explode
            and drag to spread the parts apart.
          </TutorialClip>
          <div class="howto">
            <ol>
              <li>Click <strong>New part</strong> in the Parts panel. The new part is selected, so strokes you draw now are added to it automatically (they preview purple).</li>
              <li>To sort strokes you've already drawn, press <strong>G</strong> and drag through them to put them into the active part. Switch the pen to <em>remove</em> to take strokes back out.</li>
              <li>Click a part in the panel to select it again and keep adding to it.</li>
              <li>Click <strong>Explode</strong> in the Parts panel, then drag away from the model (with no tool active) to spread the parts apart, so they're easier to see and work on. Turn it off to put them back.</li>
            </ol>
            <div class="tips">
              <strong>Tips</strong>
              <span>Ask “does this move separately?” If two pieces never move relative to each other, they are one part.</span>
              <span>Use the reference's part colours (top left) to see how it was split, though you don't have to copy it.</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 3 rig -->
      <section id="tutorial-rig" class="step">
        <div class="step-head"><span class="big-badge">3</span><h2>Rig</h2><kbd>J</kbd></div>
        <p class="step-lead">
          Connect the parts with <strong>joints</strong>, and show how far each
          one can move. A joint joins a <strong>parent</strong> part, which stays
          put, to a <strong>child</strong> part, which moves. This is the step we
          are most interested in, so take your time with it.
        </p>
        <div class="motions">
          <div class="motion">
            <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="Turning around the axis"><line x1="6" y1="24" x2="42" y2="24" stroke="#dd3333" stroke-width="3" /><path d="M24 10 A14 14 0 1 1 11 29" fill="none" stroke="#1c1c1e" stroke-width="2.5" /><path d="M8 24 L11 31 L16 26" fill="none" stroke="#1c1c1e" stroke-width="2.5" /></svg>
            <div><strong>Turn</strong><span>Rotates around the red axis. Hinges, lids, wheels, knobs.</span></div>
          </div>
          <div class="motion">
            <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="Sliding along the axis"><line x1="6" y1="24" x2="42" y2="24" stroke="#dd3333" stroke-width="3" /><path d="M4 14 L44 14 M4 14 L8 10 M4 14 L8 18 M44 14 L40 10 M44 14 L40 18" fill="none" stroke="#1c1c1e" stroke-width="2.5" /></svg>
            <div><strong>Slide</strong><span>Moves along the axis. Drawers, telescopic arms.</span></div>
          </div>
          <div class="motion">
            <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="Swinging sideways"><line x1="24" y1="44" x2="24" y2="10" stroke="#dd3333" stroke-width="3" /><path d="M10 16 A18 18 0 0 1 38 16" fill="none" stroke="#2e9e44" stroke-width="2.5" /><path d="M14 34 A14 6 0 0 0 34 34" fill="none" stroke="#3366dd" stroke-width="2.5" /></svg>
            <div><strong>Swing</strong><span>Tilts sideways, in one or two directions. Ball joints.</span></div>
          </div>
        </div>
        <p class="note">
          One joint can combine these. A screw both turns and slides, for
          example. You only show the motions the joint really has.
        </p>
        <div class="columns">
          <div class="clip-stack">
            <TutorialClip :src="CLIPS.rigAxis" label="3a" caption="Connect two parts and place the axis.">
              Drag from the base to the arm, move the pivot onto the hinge, aim
              the red axis along it.
            </TutorialClip>
            <TutorialClip :src="CLIPS.rigRange" label="3b" caption="Show the range by moving the part through it.">
              Arm Turn in the Articulations panel, circle the mouse around the
              pivot to swing the arm up to its limit and back down; the shaded
              range follows.
            </TutorialClip>
          </div>
          <div class="howto">
            <ol>
              <li>Press <strong>J</strong> and drag from the <strong>parent</strong> part to the <strong>child</strong> part.</li>
              <li>The <strong>red arrow</strong> is the joint's axis. Put its pivot where the real hinge or slide is (<strong>T</strong> to move it), and aim it (<strong>R</strong>), or point it straight along X, Y or Z with the buttons above the sketch. <em>Flip</em> reverses it.</li>
              <li>In the <strong>Articulations</strong> panel, <strong>arm a motion</strong>: Turn, Slide or Swing. A circle or arrow shows which way it moves.</li>
              <li><strong>Drag the part through the motion</strong>. To turn, circle the mouse around the pivot, like turning a knob. How far you move it becomes its range.</li>
              <li>Repeat for each joint. To change one later, press ✎ next to it in Articulations.</li>
            </ol>
            <div class="tips">
              <strong>Tips</strong>
              <span>Think about how the real object moves, then show its full range: no more, no less.</span>
              <span>Unsure? Use the reference's sliders, or <em>Play all</em>, and watch where each part turns or slides.</span>
              <span>Chains are fine: the lamp's head hangs off the upper arm, which hangs off the lower arm.</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 4 pose -->
      <section id="tutorial-pose" class="step">
        <div class="step-head"><span class="big-badge">4</span><h2>Pose</h2><kbd>A</kbd></div>
        <p class="step-lead">
          Check your rig by moving it, the way you would handle the real object.
          Save any poses you wish, that display the range of movements the
          object makes.
        </p>
        <div class="columns">
          <TutorialClip :src="CLIPS.pose" label="4" caption="Grab a part and move it; save the pose.">
            Grab the lamp head and swing it, fold the arm down, save the pose,
            then reset to rest.
          </TutorialClip>
          <div class="howto">
            <ol>
              <li>Press <strong>A</strong> and grab any part. Turning joints work like a knob: circle the mouse around the pivot. Sliding joints follow the mouse.</li>
              <li>If a joint both turns and slides, <strong>R</strong> and <strong>T</strong> switch between the two.</li>
              <li>Save the current pose in the <strong>Poses</strong> panel. Saved poses can be applied again later.</li>
            </ol>
            <div class="tips">
              <strong>Tips</strong>
              <span>Something moves the wrong way, or too far? Go back to Rig and edit that joint (✎ in Articulations).</span>
              <span>You can go back to any step at any time. Draw more, re-split parts, add joints.</span>
            </div>
          </div>
        </div>
      </section>

      <!-- finishing -->
      <section class="done-box">
        <h2>When you're done with a model</h2>
        <ul>
          <li>Press <strong>Finish</strong> at the top right. You can still reopen the model afterwards.</li>
          <li><strong>Models</strong> switches to another model at any time. Nothing is lost when you switch.</li>
          <li>Your work is saved in this browser as you go, so you can close the page and come back later.</li>
          <li>Sketch as many models as you like. There's no time limit, and you are not expected to be good at drawing.</li>
        </ul>
      </section>

      <footer v-if="first" class="footer">
        <p>
          Next you'll see a short list of the controls. You can open this
          tutorial again any time with the <strong>Tutorial</strong> button next
          to Help.
        </p>
        <button class="start" @click="$emit('start', progress())">Start</button>
      </footer>
    </div>
  </PopupFrame>
</template>

<script lang="ts">
/** Where the tutorial was scrolled when last closed, so a reopen picks up
 *  there. Module state: lasts for the page's lifetime. */
let lastScrollTop = 0;
</script>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, useTemplateRef } from "vue";
import PopupFrame from "./PopupFrame.vue";
import TutorialClip from "./TutorialClip.vue";

/** How far down the page was read, 0–1 (the furthest point reached). */
export type TutorialProgress = { maxScroll: number };

const props = defineProps<{
  /** First launch: no ✕, and a Start button at the bottom. */
  first: boolean;
}>();

defineEmits<{
  /** First launch finished with Start. */
  start: [progress: TutorialProgress];
  /** Reopened tutorial closed with ✕. */
  close: [progress: TutorialProgress];
}>();

// Clip files live in public/tutorial/ and are named here, relative to the
// page. null shows a placeholder describing what the clip should show.
// Clips are silent and stripped of metadata (see README).
const CLIPS: Record<"sketch" | "segment" | "rigAxis" | "rigRange" | "pose", string | null> = {
  sketch: "tutorial/sketch.mp4",
  segment: "tutorial/segment.mp4",
  rigAxis: "tutorial/rig_1.mp4",
  rigRange: "tutorial/rig_2.mp4",
  pose: "tutorial/pose.mp4",
};

const STEPS = [
  { id: "sketch", n: 1, name: "Sketch", key: "D", summary: "Draw the object in 3D, on a plane you move around." },
  { id: "segment", n: 2, name: "Segment", key: "G", summary: "Split the strokes into the parts that move separately." },
  { id: "rig", n: 3, name: "Rig", key: "J", summary: "Connect parts with joints and show how far they move." },
  { id: "pose", n: 4, name: "Pose", key: "A", summary: "Move the parts to check your joints, and save poses." },
];

const frame = useTemplateRef<{ contentEl: HTMLElement | null }>("frame");
let maxScroll = 0;

function scroller(): HTMLElement | null {
  return frame.value?.contentEl ?? null;
}

function onScroll(): void {
  const el = scroller();
  if (!el) return;
  const range = el.scrollHeight - el.clientHeight;
  maxScroll = Math.max(maxScroll, range > 0 ? el.scrollTop / range : 1);
}

function progress(): TutorialProgress {
  return { maxScroll: Math.round(maxScroll * 100) / 100 };
}

function jump(id: string): void {
  document.getElementById(`tutorial-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

onMounted(async () => {
  await nextTick();
  const el = scroller();
  if (!el) return;
  if (!props.first) el.scrollTop = lastScrollTop;
  el.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});

onUnmounted(() => {
  const el = scroller();
  if (!el) return;
  lastScrollTop = el.scrollTop;
  el.removeEventListener("scroll", onScroll);
});
</script>

<style scoped>
.steps {
  display: flex;
  gap: 6px;
}

.steps button {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 17px;
  background: #f3f3f3;
  font: inherit;
  font-weight: 900;
  font-size: 0.9em;
  cursor: pointer;
}

.steps button:hover {
  background: #ffe8b3;
}

.badge {
  display: inline-flex;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: #ffd16b;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
}

.tutorial {
  display: flex;
  flex-direction: column;
  gap: 52px;
  padding: 12px 24px 24px;
  line-height: 1.55;
}

h1 {
  margin: 0;
  font-size: 2.1em;
  line-height: 1.2;
}

h2 {
  margin: 0;
}

p {
  margin: 0;
}

kbd {
  font-family: inherit;
  font-weight: 900;
  font-size: 0.85em;
  padding: 1px 8px;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #cfcfcf;
  border-bottom-width: 3px;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lead {
  font-size: 1.12em;
  color: #3a3a3c;
  max-width: 760px;
}

.step-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.step-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: #f6f6f6;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.step-card:hover {
  outline: 3px solid #ffd16b;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-name {
  font-weight: 900;
  font-size: 1.12em;
}

.card-text {
  font-size: 0.9em;
  color: #4a4a4c;
}

.screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.map {
  display: flex;
  height: 300px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #d0d0d0;
  background: #dddddd;
}

.map-ref {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 10px;
  border-right: 6px solid #bdbdbd;
}

.map-toggles {
  display: flex;
  gap: 6px;
}

.map-toggles span {
  height: 22px;
  width: 64px;
  border-radius: 11px;
  background: #ffffff;
}

.map-label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a4a4c;
  font-weight: 900;
}

.map-sliders {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 180px;
  padding: 10px;
  border-radius: 8px;
  background: #ffffff;
}

.map-sliders span {
  height: 4px;
  border-radius: 2px;
  background: #c8c8c8;
}

.map-sketch {
  flex: 1.2;
  position: relative;
  display: flex;
  gap: 8px;
  padding: 10px;
}

.map-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 10px;
  background: #ffffff;
}

.map-tools span {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #eeeeee;
  font-size: 0.75em;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-tools span.on {
  background: #ffd16b;
}

.map-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-topbar {
  height: 30px;
  border-radius: 8px;
  background: #ffffff;
}

.map-panels {
  width: 130px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 6px;
}

.map-panels span {
  padding: 6px 8px;
  border-radius: 6px;
  background: #ffffff;
  font-size: 0.75em;
  font-weight: 900;
}

.callout {
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background: #1c1c1e;
  color: #ffffff;
  font-weight: 900;
  font-size: 0.85em;
  display: flex;
  align-items: center;
  justify-content: center;
}

.legend {
  margin: 0;
  padding-left: 22px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
  row-gap: 6px;
  font-size: 0.94em;
}

.view-box {
  display: flex;
  gap: 32px;
  align-items: flex-start;
  padding: 24px 28px;
  border-radius: 12px;
  background: #fff3d6;
}

.view-box > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.view-box table {
  flex: 1;
  border-collapse: collapse;
  font-size: 0.94em;
}

.view-box td {
  padding: 6px 12px 6px 0;
}

.view-box td:first-child {
  white-space: nowrap;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 20px;
  border-top: 1px solid #eeeeee;
  scroll-margin-top: 8px;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.step-head h2 {
  font-size: 1.75em;
}

.big-badge {
  display: inline-flex;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: #ffd16b;
  align-items: center;
  justify-content: center;
  font-size: 1.4em;
  font-weight: 900;
}

.step-lead {
  font-size: 1.06em;
  max-width: 800px;
}

.columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 32px;
  align-items: start;
}

.clip-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.howto {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.howto ol {
  margin: 0;
  padding-left: 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tips {
  padding: 14px 16px;
  border-radius: 10px;
  background: #f6f6f6;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.motions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.motion {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid #e2e2e2;
}

.motion svg {
  flex: none;
}

.motion div {
  display: flex;
  flex-direction: column;
}

.motion span {
  font-size: 0.9em;
  color: #4a4a4c;
}

.note {
  font-size: 0.94em;
  color: #3a3a3c;
}

.done-box {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 28px;
  border-radius: 12px;
  background: #e3f5e1;
}

.done-box ul {
  margin: 0;
  padding-left: 22px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.footer {
  display: flex;
  align-items: center;
  gap: 20px;
}

.footer p {
  flex: 1;
  color: #3a3a3c;
  font-size: 0.94em;
}

.start {
  height: 52px;
  padding: 0 40px;
  border: none;
  border-radius: 26px;
  background: #ffd16b;
  font: inherit;
  font-weight: 900;
  font-size: 1.12em;
  cursor: pointer;
}

.start:hover {
  background: #ffc23d;
}

@media (max-width: 760px) {
  .step-cards,
  .motions,
  .columns,
  .legend {
    grid-template-columns: minmax(0, 1fr);
  }

  .view-box {
    flex-direction: column;
  }
}
</style>
