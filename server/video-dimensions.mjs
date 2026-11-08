// Bounded AVC SPS/PES metadata reader; no video decoding or external binaries.
export function dimensionsSPS(sps){
 const rbsp=[];for(let i=1;i<sps.length;i++){if(i>=3&&sps[i]===3&&sps[i-1]===0&&sps[i-2]===0)continue;rbsp.push(sps[i]);}
 let pos=0;const bits=n=>{if(pos+n>rbsp.length*8)throw Error('short_sps');let value=0;for(let i=0;i<n;i++,pos++)value=value*2+((rbsp[pos>>3]>>(7-(pos&7)))&1);return value;};
 const ue=()=>{let zeros=0;while(bits(1)===0){if(++zeros>30)throw Error('invalid_sps');}return (2**zeros-1)+(zeros?bits(zeros):0);},se=()=>{const v=ue();return v&1?(v+1)/2:-v/2;};
 const profile=bits(8);bits(8);bits(8);ue();let chroma=1,separate=0;
 if([100,110,122,244,44,83,86,118,128,138,139,134,135].includes(profile)){
  chroma=ue();if(chroma>3)throw Error('invalid_chroma');if(chroma===3)separate=bits(1);ue();ue();bits(1);
  if(bits(1))for(let i=0;i<(chroma!==3?8:12);i++){if(!bits(1))continue;let last=8,next=8;for(let j=0;j<(i<6?16:64);j++){if(next!==0)next=(last+se()+256)%256;last=next===0?last:next;}}
 }
 ue();const order=ue();if(order===0)ue();else if(order===1){bits(1);se();se();const n=ue();if(n>256)throw Error('invalid_sps');for(let i=0;i<n;i++)se();}
 ue();bits(1);const w=ue()+1,h=ue()+1,frame=bits(1);if(!frame)bits(1);bits(1);let l=0,r=0,t=0,b=0;if(bits(1)){l=ue();r=ue();t=ue();b=ue();}
 const c=separate?0:chroma,x=c===0||c===3?1:2,y=(c===1?2:1)*(2-frame),width=w*16-x*(l+r),height=(2-frame)*h*16-y*(t+b);
 if(width<16||height<16||width>8192||height>8192)throw Error('invalid_size');return {width,height};
}
export function tsDimensions(bytes){
 let offset=-1;for(let n=0;n<188&&n+376<bytes.length;n++)if(bytes[n]===0x47&&bytes[n+188]===0x47&&bytes[n+376]===0x47){offset=n;break;}if(offset<0)return null;
 const tracks=new Map();
 for(let at=offset;at+188<=bytes.length;at+=188){const p=bytes.subarray(at,at+188),pid=((p[1]&31)<<8)|p[2],mode=(p[3]>>4)&3;if(mode===0||mode===2)continue;let start=4+(mode===3?p[4]+1:0);if(start>=188)continue;
  if((p[1]&0x40)&&p[start]===0&&p[start+1]===0&&p[start+2]===1){if(p[start+3]<0xe0||p[start+3]>0xef)continue;start+=9+p[start+8];if(!tracks.has(pid))tracks.set(pid,[]);}
  if(tracks.has(pid))tracks.get(pid).push(...p.subarray(start));
 }
 for(const list of tracks.values()){const data=Uint8Array.from(list);for(let i=0;i<data.length-4;i++)if(data[i]===0&&data[i+1]===0&&data[i+2]===1&&(data[i+3]&31)===7){let end=i+4;while(end<data.length-3&&!(data[end]===0&&data[end+1]===0&&(data[end+2]===1||data[end+2]===0&&data[end+3]===1)))end++;try{return dimensionsSPS(data.subarray(i+3,end));}catch{}}}
 return null;
}
