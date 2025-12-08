---
layout: page
title: Playground
---

<script setup>
import { defineAsyncComponent } from 'vue'

const Playground = defineAsyncComponent(() =>
  import('./.vitepress/components/Playground.vue')
)
</script>

<ClientOnly>
  <Suspense>
    <Playground />
    <template #fallback>
      <div class="loading-fallback">
        <div class="spinner"></div>
        <span>Loading Playground...</span>
      </div>
    </template>
  </Suspense>
</ClientOnly>

<style>
.loading-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  height: 80vh;
  color: var(--vp-c-text-2);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--vp-c-divider);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
