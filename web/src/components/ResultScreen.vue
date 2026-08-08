<script setup lang="ts">
import type { PublicQuestion, QuizResult } from '@quizforge/shared'

defineProps<{
  result: QuizResult
  questions: PublicQuestion[]
}>()

defineEmits<{
  restart: []
}>()

// Scores carry float noise from the weighted average. Two decimals,
// trailing zeros removed.
function formatScore(score: number): string {
  return String(Number(score.toFixed(2)))
}
</script>

<template>
  <section class="screen-enter">
    <p class="font-mono text-xs text-muted">
      <span class="text-accent" aria-hidden="true">##</span> result
    </p>

    <p class="mt-6 font-serif text-7xl font-semibold tracking-tight">
      {{ formatScore(result.finalScore) }}
    </p>
    <p class="mt-2 font-mono text-xs text-muted">
      final score · weighted average over {{ questions.length }} questions
    </p>

    <ul class="mt-10 border-t border-line">
      <li
        v-for="(question, index) in questions"
        :key="question.id"
        class="flex items-baseline gap-4 border-b border-line py-3"
      >
        <span class="shrink-0 font-mono text-xs text-muted">q{{ index + 1 }}</span>
        <span class="grow truncate font-serif text-sm">{{
          question.text
        }}</span>
        <span class="shrink-0 font-mono text-sm text-accent">{{
          formatScore(result.scores[question.id] ?? 0)
        }}</span>
      </li>
    </ul>

    <button
      type="button"
      class="mt-8 rounded-md border border-line px-5 py-2.5 font-mono text-sm transition-colors hover:bg-wash focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      @click="$emit('restart')"
    >
      Start another quiz
    </button>
  </section>
</template>
