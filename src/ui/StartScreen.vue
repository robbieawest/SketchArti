<template>
  <PopupFrame :title="STUDY_TITLE" :closable="false">
    <form @submit.prevent="submit">
      <p v-for="(paragraph, i) in INFORMATION_PARAGRAPHS" :key="i">
        {{ paragraph }}
      </p>

      <h2>About you</h2>
      <label v-for="question in PROFILE_QUESTIONS" :key="question.id" class="field">
        <span>
          {{ question.label }}<span v-if="question.required" class="required"> *</span>
        </span>
        <select
          v-if="question.type === 'select'"
          v-model="answers[question.id]"
          :required="question.required"
        >
          <option value="" disabled>Choose…</option>
          <option v-for="option in question.options" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
        <input
          v-else
          v-model="answers[question.id]"
          type="text"
          :required="question.required"
        />
      </label>
      <p v-if="answers.device && answers.device !== 'Mouse'" class="warning">
        This study works best with a mouse with a scroll wheel. A trackpad
        works, but zooming and rotating the view will be harder.
      </p>

      <h2>Consent</h2>
      <label v-for="(statement, i) in CONSENT_STATEMENTS" :key="i" class="consent">
        <input v-model="agreed[i]" type="checkbox" required />
        <span>{{ statement }}</span>
      </label>

      <button type="submit" :disabled="!canSubmit">I agree — start</button>
    </form>
  </PopupFrame>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import PopupFrame from "./PopupFrame.vue";
import {
  CONSENT_STATEMENTS,
  INFORMATION_PARAGRAPHS,
  PROFILE_QUESTIONS,
  STUDY_TITLE,
} from "../study/questions";
import type { ParticipantRecord } from "../study/types";

const emit = defineEmits<{ done: [record: ParticipantRecord] }>();

const answers = reactive<Record<string, string>>(
  Object.fromEntries(PROFILE_QUESTIONS.map((q) => [q.id, ""])),
);
const agreed = reactive(CONSENT_STATEMENTS.map(() => false));

const canSubmit = computed(
  () =>
    agreed.every(Boolean) &&
    PROFILE_QUESTIONS.every((q) => !q.required || answers[q.id] !== ""),
);

function submit(): void {
  if (!canSubmit.value) return;
  const now = Date.now();
  emit("done", {
    id: crypto.randomUUID(),
    createdAt: now,
    profile: { ...answers },
    consent: { given: true, at: now, statements: [...CONSENT_STATEMENTS] },
  });
}
</script>

<style scoped>
form {
  max-width: 680px;
  margin: 0 auto;
}

h2 {
  margin-top: 28px;
  font-size: 1.15em;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
  font-weight: 700;
}

.field select,
.field input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid #cccccc;
  border-radius: 8px;
  font: inherit;
  font-weight: 400;
}

.required {
  color: #c62828;
}

.consent {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 10px;
}

.consent input {
  margin-top: 5px;
}

.warning {
  padding: 8px 12px;
  border-radius: 8px;
  background: #fff3d6;
  font-size: 0.9em;
}

button {
  margin-top: 18px;
  height: 40px;
  padding: 0 20px;
  border: none;
  border-radius: 20px;
  background: #ffd16b;
  font-weight: 900;
  font-size: 1em;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
