import type { useNutritionFoods } from './use-nutrition-foods';
export function FoodLibraryStatus({library}:{library:ReturnType<typeof useNutritionFoods>}) {
  return <>{library.loading&&<p role="status">Loading food library…</p>}{library.error&&<p role="alert">{library.error} <button type="button" className="secondary" onClick={library.retry}>Retry food library</button></p>}</>;
}
