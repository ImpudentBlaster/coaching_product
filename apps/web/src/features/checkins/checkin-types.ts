export type Field = { id:string; label:string; type:'NUMBER'|'RATING'|'SHORT_TEXT'|'LONG_TEXT'; required:boolean; min?:number|undefined; max?:number|undefined; unit?:string; metric?:boolean; flag?:{operator:'GT'|'LT';value:number}|undefined };
export type Definition = { name:string; fields:Field[] };
export type Checkin = { id:string; clientId:string; clientName:string; dueDate:string; notes:string; form:Definition; formId:string|null; status:string; data:Record<string,string|number>; revision:number; submittedAt:string|null; reviewedAt:string|null; reviewStatus:string|null; reviewNotes:string|null; flags:Array<{id:string;label:string;value:number}>|null };
export const defaultDefinition:Definition = { name:'Daily check-in',fields:[
  {id:'weight',label:'Current weight',type:'NUMBER',required:true,min:0.01,max:1000,unit:'kg',metric:true},
  ...['Energy','Sleep quality','Stress'].map((label,index):Field=>({id:`rating${index}`,label,type:'RATING',required:true,min:1,max:10,metric:true,...(index===2?{flag:{operator:'GT' as const,value:5}}:{})})),
  ...['Training adherence','Nutrition adherence'].map((label,index):Field=>({id:`adherence${index}`,label,type:'NUMBER',required:true,min:0,max:100,unit:'%',metric:true})),
  ...['Wins','Challenges','Questions for your coach'].map((label,index):Field=>({id:`text${index}`,label,type:'LONG_TEXT',required:false})),
] };
export function collectAnswers(definition:Definition, values:Record<string,string|number>) {
  return Object.fromEntries(definition.fields.filter(field=>values[field.id]!==undefined&&String(values[field.id]).trim()!=='').map(field=>[field.id,field.type==='NUMBER'||field.type==='RATING'?Number(values[field.id]):values[field.id]]));
}
