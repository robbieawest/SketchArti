<template>
  <PopupFrame title="Help" :closable="true" @close="$emit('close')">
      <p class="todo">A summary of the controls. For a step-by-step walkthrough, open the Tutorial.</p>

      <h3>Moving the view (both sides)</h3>
      <table>
        <tr><td><kbd>Alt</kbd> + drag</td><td>Rotate around the model</td></tr>
        <tr><td><kbd>Space</kbd> + drag</td><td>Pan</td></tr>
        <tr><td>Scroll wheel / right-drag</td><td>Zoom</td></tr>
      </table>

      <h3>Reference model (left)</h3>
      <p>
        Toggle part colours and joint arrows at the top. Use the sliders to
        move each joint, or <em>Play all</em> to see every joint move.
        Circular arrows rotate; straight arrows slide.
      </p>

      <h3>Your sketch (right)</h3>
      <table>
        <tr><td><kbd>D</kbd> Draw</td><td>Drag on the drawing plane. Move/rotate the plane with its gizmo (<kbd>T</kbd>/<kbd>R</kbd>/<kbd>S</kbd>), or face it front/side/top with the buttons. With <em>Snap</em> on, it moves in quarter units and turns in 15° steps.</td></tr>
        <tr><td><kbd>E</kbd> Erase</td><td>Drag over strokes to delete them.</td></tr>
        <tr><td><kbd>V</kbd> Select</td><td>Click a stroke, double-click a part, ctrl+click to add to the selection. Move it with the gizmo.</td></tr>
        <tr><td><kbd>G</kbd> Segment</td><td>Drag through strokes to put them into the active part (Parts panel). Each part gets its own colour.</td></tr>
        <tr><td><kbd>J</kbd> Joint</td><td>Drag from a parent part to a child part to connect them. The red arrow is the joint axis: move its pivot (<kbd>T</kbd>), aim it (<kbd>R</kbd>) or pick X/Y/Z from the toolbar. Then arm a motion in the Articulations panel (a circle or arrow shows it) and drag the part through it — circle the mouse around the pivot to turn — how far you move it becomes its range.</td></tr>
        <tr><td><kbd>A</kbd> Articulate</td><td>Grab a part and drag it. Rotating joints turn like a knob: circle the mouse around the pivot. Sliding joints follow the mouse. Save poses in the Poses panel.</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Undo / redo</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Deselect</td></tr>
      </table>
      <p>
        Pressing a tool's key (or clicking its button) again turns it off.
        <em>Explode</em> in the Parts panel spreads the parts apart so they
        are easier to work on. <em>Guide</em> (top right) shows a faint
        outline of the reference model to help with proportions.
      </p>
  </PopupFrame>
</template>

<script setup lang="ts">
import PopupFrame from "./PopupFrame.vue";

defineEmits<{ close: [] }>();
</script>

<style scoped>
.todo {
  margin-top: 0;
  color: #777;
  font-style: italic;
}

h3 {
  margin-bottom: 6px;
}

table {
  border-collapse: collapse;
  width: 100%;
}

td {
  padding: 4px 8px 4px 0;
  vertical-align: top;
}

td:first-child {
  white-space: nowrap;
  font-weight: 700;
  width: 1%;
}

kbd {
  font-family: inherit;
  font-size: 0.85em;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eeeeee;
  border: 1px solid #d0d0d0;
}
</style>
