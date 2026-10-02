export type Onboarding = {
  id: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
  data: Record<string, string | number | string[]>;
  submittedAt: string | null;
  reviewedAt: string | null;
};
type Field = {name:string;label:string;required?:boolean;type?:string;max?:number;step?:number;maxLength?:number};
export const onboardingSections: Array<{title:string;description:string;fields:Field[]}> = [
  { title: 'About you', description: 'Tell your coach what you want to achieve.', fields: [
    {name:'personalDetails',label:'About you',required:true,maxLength:1000},
    {name:'age',label:'Age (years)',required:true,type:'number',max:120},
    {name:'fitnessGoal',label:'Your fitness goals',required:true,maxLength:500},
  ]},
  { title: 'Measurements', description: 'Use your current measurements as a starting point.', fields: [
    {name:'weight',label:'Empty stomach body weight (kg)',required:true,type:'number',max:1000,step:0.1},
    {name:'waist',label:'Waist at navel (cm)',required:true,type:'number',max:400,step:0.1},
    {name:'height',label:'Height (cm)',required:true,type:'number',max:300,step:0.1},
  ]},
  { title: 'Training', description: 'Help your coach build a plan that fits your routine.', fields: [
    {name:'experienceLevel',label:'Training experience',required:true,type:'experience'},
    {name:'injuries',label:'Injuries or limitations',maxLength:2000},
    {name:'availableEquipment',label:'Available equipment (comma separated)',type:'equipment',maxLength:5000},
    {name:'preferredTrainingDays',label:'Preferred training days',type:'days'},
  ]},
  { title: 'Nutrition', description: 'Share your usual eating habits and preferences.', fields: [
    {name:'currentDiet',label:'Describe your current diet',required:true,maxLength:4000},
    {name:'nutritionPreferences',label:'Food preferences, allergies or restrictions',maxLength:2000},
    {name:'additionalNotes',label:'Anything else your coach should know',maxLength:4000},
  ]},
];
