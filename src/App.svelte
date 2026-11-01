<script lang="ts">
  import Diagnostics from './lib/Diagnostics.svelte'
  import LayerToggles from './lib/map/LayerToggles.svelte'
  import Legend from './lib/map/Legend.svelte'
  import MapView from './lib/map/MapView.svelte'
  import SpotsSheet from './lib/sheet/SpotsSheet.svelte'
  import { app } from './lib/stores/app.svelte'
  import TimeDial from './lib/time/TimeDial.svelte'
</script>

<MapView />
<Legend />
<LayerToggles />
<TimeDial />
<SpotsSheet />
{#if app.showDiagnostics}
  <Diagnostics onclose={() => (app.showDiagnostics = false)} />
{/if}
