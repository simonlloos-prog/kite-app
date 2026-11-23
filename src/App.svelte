<script lang="ts">
  import Diagnostics from './lib/Diagnostics.svelte'
  import LayerToggles from './lib/map/LayerToggles.svelte'
  import Legend from './lib/map/Legend.svelte'
  import MapView from './lib/map/MapView.svelte'
  import SlotsScreen from './lib/sheet/SlotsScreen.svelte'
  import { app } from './lib/stores/app.svelte'
  import TimeDial from './lib/time/TimeDial.svelte'
</script>

<MapView />
<Legend />
<LayerToggles />
<TimeDial />
{#if app.slotsOpen}<SlotsScreen />{/if}
{#if app.showDiagnostics}
  <Diagnostics onclose={() => (app.showDiagnostics = false)} />
{/if}
