<script setup lang="ts">
import type { ProgressStage } from '@quizforge/shared'
import { ref } from 'vue'

const props = defineProps<{
  busy: boolean
  error: string
  // The stages the agent reported so far, streamed over SSE. The last
  // entry is the running stage; the entries before it are done.
  stages: ProgressStage[]
}>()

const emit = defineEmits<{
  start: [url: string]
}>()

const url = ref('')

function handleSubmit() {
  if (props.busy || !url.value.trim()) return
  emit('start', url.value.trim())
}
</script>

<template>
  <section class="screen-enter">
    <h1
      class="font-serif text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
    >
      Turn a document into a&nbsp;quiz.
    </h1>
    <p class="mt-4 max-w-md text-lg text-muted">
      Paste a link to a Markdown document. The agent reads it, writes a short
      quiz, and scores your answers.
    </p>

    <form v-if="!busy" class="mt-10" @submit.prevent="handleSubmit">
      <label class="font-mono text-xs text-muted" for="source-url">source url</label>
      <input
        id="source-url"
        v-model="url"
        type="url"
        required
        placeholder="https://github.com/user/repo/blob/main/README.md"
        autocomplete="off"
        spellcheck="false"
        class="mt-2 w-full rounded-md border border-line bg-transparent px-4 py-3 font-mono text-sm placeholder:text-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
      />
      <p v-if="error" class="mt-3 font-mono text-sm text-warn">
        {{ error }}
      </p>
      <button
        type="submit"
        class="mt-5 rounded-md bg-ink px-5 py-2.5 font-mono text-sm text-paper transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:outline-none"
      >
        Generate quiz
      </button>
    </form>

    <div v-else class="mt-10 font-mono text-sm" role="status">
      <p v-if="stages.length === 0">
        <span class="cursor-blink text-accent">▌</span>
      </p>
      <p
        v-for="(label, index) in stages"
        :key="label"
        class="mt-2 first:mt-0"
        :class="index < stages.length - 1 ? 'text-muted' : 'text-ink'"
      >
        <span class="text-accent">›</span> {{ label
        }}<span
          v-if="index === stages.length - 1"
          class="cursor-blink text-accent"
        >&nbsp;▌</span>
      </p>
    </div>
  </section>
</template>
