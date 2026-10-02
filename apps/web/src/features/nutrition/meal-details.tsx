import { EditorDialog } from '../../components/editor-dialog';
import { NutritionTotals, type NutritionEntry } from './nutrition-details';
import { NutritionFoodList } from './nutrition-food-list';
import '../coach/workout-details.css';
import './meal-details.css';

export function MealDetails({ meal, onClose, onEdit }: { meal: NutritionEntry; onClose:()=>void; onEdit:()=>void }) {
  const foods=meal.data.items??[];
  return <EditorDialog title="Meal details" variant="drawer" trackChanges={false} onClose={onClose}
    headerContent={<div className="workout-details-heading"><div><h3>{meal.data.name}</h3><p>{foods.length} {foods.length===1?'food':'foods'}</p></div><button type="button" className="primary" onClick={onEdit}>Edit meal</button></div>}>
    <div className="detail-view meal-details">
      <section className="detail-section" aria-label="Meal information">
        <h4 className="detail-section-title">Meal information</h4>
        {meal.data.notes&&<p className="meal-notes">{meal.data.notes}</p>}
        {meal.data.nutrients&&<NutritionTotals nutrients={meal.data.nutrients}/>}
      </section>
      <section className="detail-section" aria-label="Foods">
        <h4 className="detail-section-title">Foods</h4>
        {foods.length?<NutritionFoodList items={foods}/>:<p className="detail-empty">No foods added to this meal yet.</p>}
      </section>
    </div>
  </EditorDialog>;
}
