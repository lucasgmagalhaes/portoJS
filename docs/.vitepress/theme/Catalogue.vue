<script setup lang="ts">
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { KINDS, catalogue, filterCatalogue } from '../catalogue';
import type { ItemKind } from '../catalogue';

const query = ref('');
const kind = ref<ItemKind | undefined>(undefined);
const items = computed(() => filterCatalogue(catalogue, { query: query.value, kind: kind.value }));

function href(link: string): string {
  return link.startsWith('http') ? link : withBase(link);
}

function pick(next: ItemKind | undefined): void {
  kind.value = next;
}
</script>

<template>
  <div>
    <div class="pj-catalogue-tools">
      <input
        v-model="query"
        type="search"
        placeholder="Search packages, components, tools..."
        aria-label="Search the catalogue"
      />
      <div class="pj-chips" role="group" aria-label="Filter by kind">
        <button class="pj-chip" :aria-pressed="kind === undefined" @click="pick(undefined)">
          All
        </button>
        <button
          v-for="k in KINDS"
          :key="k"
          class="pj-chip"
          :aria-pressed="kind === k"
          @click="pick(k)"
        >
          {{ k }}
        </button>
      </div>
    </div>
    <p v-if="items.length === 0" class="pj-empty">Nothing matches. Try a shorter search.</p>
    <div class="pj-grid">
      <article v-for="item in items" :key="item.name" class="pj-card">
        <span class="pj-kind">{{ item.kind }}</span>
        <h3>
          <a :href="href(item.link)">{{ item.name }}</a>
        </h3>
        <p>{{ item.summary }}</p>
        <code v-if="item.package">@portojs/{{ item.package }}</code>
      </article>
    </div>
  </div>
</template>
