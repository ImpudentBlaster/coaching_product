import { EditorDialog } from '../../components/editor-dialog';
import { NutritionTotals, type NutritionEntry, type NutritionNode } from './nutrition-details';
import { NutritionFoodList } from './nutrition-food-list';
import '../coach/workout-details.css';
import './meal-details.css';

export function DayDetails({ day, onClose, onEdit }: { day: NutritionEntry; onClose:()=>void; onEdit:()=>void }) {
  const items=day.data.items??[];
  return <EditorDialog title="Day details" variant="drawer" trackChanges={false} onClose={onClose}
    headerContent={<div className="workout-details-heading"><div><h3>{day.data.name}</h3><p>{items.length} {items.length===1?'meal':'meals'}</p></div><button type="button" className="primary" onClick={onEdit}>Edit day</button></div>}>
    <DayContent node={day.data} onEdit={onEdit}/>
  </EditorDialog>;
}

export function DayContent({node,onEdit}:{node:NutritionNode;onEdit?:()=>void}) {
  const items=node.items??[];
  return <div className="detail-view meal-details day-details">
      <section className="detail-section" aria-label="Day information">
        <h4 className="detail-section-title">Day information</h4>
        {node.notes&&<p className="meal-notes">{node.notes}</p>}
        {node.nutrients&&<NutritionTotals nutrients={node.nutrients}/>}
      </section>
      <section className="detail-section" aria-label="Meals">
        <h4 className="detail-section-title">Meals</h4>
        {items.length?<ul className="day-entry-list">{items.map((item,index)=><li key={`${item.id}-${index}`}>
          <details className="day-meal-details">
            <summary><span className="day-entry-heading"><strong>{item.label||item.node.name}</strong><span className="day-entry-meta">{item.node.kind==='foods'?1:item.node.items?.length??0} {(item.node.kind==='foods'||item.node.items?.length===1)?'food':'foods'}</span></span>
              {(item.nutrients??item.node.nutrients)&&<NutritionTotals inline nutrients={(item.nutrients??item.node.nutrients)!}/>}
            </summary>
            {item.node.kind==='foods'?<NutritionFoodList items={[{...item,label:''}]}/>:item.node.items?.length?<NutritionFoodList items={item.node.items}/>:<p className="detail-empty">No foods added to this meal yet.</p>}
          </details>
        </li>)}</ul>:<><p className="detail-empty">No meals added to this day yet.</p>{onEdit&&<button type="button" className="secondary" onClick={onEdit}>Edit day</button>}</>}
      </section>
    </div>;
}
