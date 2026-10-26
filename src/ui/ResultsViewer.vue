<template>
  <!-- the list stays mounted under a session, keeping what was expanded -->
  <ResultsBrowser
    v-show="!open"
    :participants="participants"
    :model-names="modelNames"
    @loaded="participants = $event"
    @open="(p, s) => (open = { participant: p, session: s })"
  />
  <SessionViewer
    v-if="open"
    :key="`${open.participant.code}/${open.session.modelId}`"
    :participant="open.participant"
    :session="open.session"
    :model-name="modelNames.get(open.session.modelId) ?? open.session.modelId"
    :model-url="modelUrls.get(open.session.modelId) ?? ''"
    @back="open = null"
  />
</template>

<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import ResultsBrowser from "./ResultsBrowser.vue";
import SessionViewer from "./SessionViewer.vue";
import { loadModelIndex, resolveModelPath } from "./modelIndex";
import type { ResultParticipant, ResultSession } from "../study/results";

const participants = shallowRef<ResultParticipant[] | null>(null);
const open = shallowRef<{ participant: ResultParticipant; session: ResultSession } | null>(null);
const modelNames = ref(new Map<string, string>());
const modelUrls = ref(new Map<string, string>());

onMounted(async () => {
  try {
    const entries = await loadModelIndex();
    modelNames.value = new Map(entries.map((e) => [e.id, e.name]));
    modelUrls.value = new Map(entries.map((e) => [e.id, resolveModelPath(e.path)]));
  } catch (e) {
    console.error("model index:", e); // ids are shown instead of names
  }
});
</script>
