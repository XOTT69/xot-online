export const providers = [];
export function normalize(item,provider){
 if(!item||typeof item!=='object'||!item.title)return null;
 return {provider:provider.id,title:String(item.title).slice(0,200),year:item.year||null,id:item.id||null};
}
