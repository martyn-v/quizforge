<script setup lang="ts">
import type { AskQuestionPayload } from '@quizforge/shared'
import { computed, ref } from 'vue'

const props = defineProps<{
  payload: AskQuestionPayload
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  submit: [selections: string[]]
}>()

const selected = ref<string[]>([])

const isMulti = computed(() => props.payload.question.type === 'multi')
const progress = computed(
  () => ((props.payload.index + 1) / props.payload.total) * 100,
)

// The selection marker is Markdown task-list syntax: round for
// single-select, square for multi-select. The marker is the control.
function marker(optionId: string): string {
  const on = selected.value.includes(optionId)
  if (isMulti.value) return on ? '[x]' : '[ ]'
  return on ? '(•)' : '( )'
}

function toggle(optionId: string) {
  if (props.busy) return
  if (!isMulti.value) {
    selected.value = [optionId]
    return
  }
  selected.value = selected.value.includes(optionId)
    ? selected.value.filter((id) => id !== optionId)
    : [...selected.value, optionId]
}

function handleSubmit() {
  if (props.busy || selected.value.length === 0) return
  emit('submit', selected.value)
}
</script>

<template>
  <section class="screen-enter">
    <p class="font-mono text-xs text-muted">
      <span class="text-accent" aria-hidden="true">##</span>
      question {{ payload.index + 1 }} / {{ payload.total }}
    </p>
    <div class="mt-3 h-px w-full bg-line" aria-hidden="true">
      <div
        class="h-px bg-accent transition-[width] duration-500"
        :style="{ width: `${progress}%` }"
      ></div>
    </div>

    <h2 class="mt-8 font-serif text-2xl font-semibold text-balance sm:text-3xl">
      {{ payload.question.text }}
    </h2>
    <p class="mt-3 font-mono text-xs text-muted">
      {{ isMulti ? 'select all that apply' : 'select one' }}
    </p>

    <p
      v-if="payload.reason"
      class="mt-5 rounded-md border border-warn/30 bg-warn-wash px-4 py-3 font-mono text-sm text-warn"
      role="alert"
    >
      {{ payload.reason }}
    </p>

    <div
      class="mt-6 space-y-2.5"
      role="group"
      :aria-label="isMulti ? 'Select all answers that apply' : 'Select one answer'"
    >
      <button
        v-for="option in payload.question.options"
        :key="option.id"
        type="button"
        :aria-pressed="selected.includes(option.id)"
        :disabled="busy"
        class="flex w-full items-baseline gap-3 rounded-md border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
        :class="
          selected.includes(option.id)
            ? 'border-accent bg-accent-wash'
            : 'border-line hover:bg-wash'
        "
        @click="toggle(option.id)"
      >
        <span
          class="shrink-0 font-mono text-sm"
          :class="selected.includes(option.id) ? 'text-accent' : 'text-muted'"
          aria-hidden="true"
        >{{ marker(option.id) }}</span>
        <span class="font-serif text-lg">{{ option.text }}</span>
      </button>
    </div>

    <p v-if="error" class="mt-4 font-mono text-sm text-warn">
      {{ error }}
    </p>

    <button
      type="button"
      :disabled="busy || selected.length === 0"
      class="mt-7 rounded-md bg-ink px-5 py-2.5 font-mono text-sm text-paper transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:outline-none disabled:opacity-40"
      @click="handleSubmit"
    >
      {{ busy ? 'Submitting…' : 'Submit answer' }}
    </button>
  </section>
</template>
