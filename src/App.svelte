<script lang="ts">
  import LayerToggles from './lib/map/LayerToggles.svelte'
  import Legend from './lib/map/Legend.svelte'
  import MapView from './lib/map/MapView.svelte'
  import SpotsSheet from './lib/sheet/SpotsSheet.svelte'
  import TimeDial from './lib/time/TimeDial.svelte'
</script>

<MapView />
<Legend />
<LayerToggles />
<TimeDial />
<SpotsSheet />
