<script setup lang="ts">
import type {
  AskQuestionPayload,
  ProgressStage,
  PublicQuestion,
  QuizResult,
} from '@quizforge/shared'
import { ref } from 'vue'
import { ApiError, startSessionStream, submitAnswer } from './api'
import QuestionScreen from './components/QuestionScreen.vue'
import ResultScreen from './components/ResultScreen.vue'
import StartScreen from './components/StartScreen.vue'

type Screen = 'start' | 'question' | 'result'

const screen = ref<Screen>('start')
const busy = ref(false)
const error = ref('')
const sessionId = ref('')
const payload = ref<AskQuestionPayload | null>(null)
const result = ref<QuizResult | null>(null)
// Questions in the order the agent asked them. The result screen joins
// them to the score record by question id.
const askedQuestions = ref<PublicQuestion[]>([])
// The stages the agent reported for the running start, in order.
const stages = ref<ProgressStage[]>([])

function messageOf(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message
  return 'Something went wrong. Try again.'
}

async function handleStart(url: string) {
  busy.value = true
  error.value = ''
  stages.value = []
  try {
    const response = await startSessionStream(url, (stage) => {
      stages.value.push(stage)
    })
    sessionId.value = response.sessionId
    payload.value = response.question
    askedQuestions.value = [response.question.question]
    screen.value = 'question'
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = false
  }
}

async function handleSubmit(selections: string[]) {
  busy.value = true
  error.value = ''
  try {
    const response = await submitAnswer(sessionId.value, selections)
    if (response.kind === 'question') {
      payload.value = response.question
      const next = response.question.question
      if (!askedQuestions.value.some((q) => q.id === next.id)) {
        askedQuestions.value.push(next)
      }
    } else {
      result.value = response.result
      screen.value = 'result'
    }
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = false
  }
}

function handleRestart() {
  screen.value = 'start'
  busy.value = false
  error.value = ''
  sessionId.value = ''
  payload.value = null
  result.value = null
  askedQuestions.value = []
}
</script>

<template>
  <main class="mx-auto flex min-h-svh w-full max-w-xl flex-col px-6">
    <header class="pt-10 pb-4 font-mono text-sm">
      <span class="text-accent" aria-hidden="true"># </span>
      <span class="font-medium">quizforge</span>
    </header>

    <div class="flex grow flex-col justify-center pb-28">
      <StartScreen
        v-if="screen === 'start'"
        :busy="busy"
        :error="error"
        :stages="stages"
        @start="handleStart"
      />
      <QuestionScreen
        v-else-if="screen === 'question' && payload"
        :key="payload.question.id"
        :payload="payload"
        :busy="busy"
        :error="error"
        @submit="handleSubmit"
      />
      <ResultScreen
        v-else-if="screen === 'result' && result"
        :result="result"
        :questions="askedQuestions"
        @restart="handleRestart"
      />
    </div>
  </main>
</template>
