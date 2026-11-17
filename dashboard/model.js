// RadarModel v2: Econometric Comps & Costed Farming Engine (Node 22 + Browser).
(function(root){
'use strict';
const MODEL_VERSION='radar-comps-v2',DAY=864e5,MAX_V=1e14,UC='Uncategorized',M=Math,mr=M.round,mx=M.max,mn=M.min,ml=M.log,me=M.exp,ma=M.abs,mf=M.floor,OA=Object.assign,OK=Object.keys,AF=Array.from,fin=Number.isFinite,OC=()=>Object.create(null);
const DEPOSIT_PRESETS=[2500,10000,50000],HORIZON_PRESETS=[4,8,16],DEF_DEP=10000,DEF_WKS=8,APR=0.045,B_N=200,B_SEED=0x74723032;
const B_EX='CEX|Canonical Bridge|Bridge|Restaked BTC|',ANC_EX=new Set((B_EX+'Liquid Staking|Liquid Restaking').split('|')),PRE_EX=new Set((B_EX+'Stablecoin Wrapper').split('|'));
const VER_RE=/\s(?:[Vv]\d+(?:\.\d+)?|\d+\.\d+)$/,SLUG_RE=/^(?:wbtc|weth|wseth|wsteth|usdt0|cbbtc|cbeth|wbeth)$/i;
const CEX_RE=/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Okcoin|Bitfinex|Gemini|Gate|Crypto\.com|MEXC|KuCoin|HTX|BitMart)\b/i;
const WRAP_RE=/\b(?:wrapped|bridged)\b|\bstaked\s+(?:eth|sol|btc|avax|near|ton|sui|apt|bnb|atom|trx|xrp|hype|bera|mon|sei)\b/i;
const L2_RE=/^(?:arbitrum|base|optimism|polygon|blast|scroll|linea|mantle|ink|unichain|starknet|zksync|morph|rise|manta|katana|world|x layer|metis|mode|taiko|bob|monad|megaeth|soneium|berachain|plume|plasma|arc|pharos|robinhood)/i;
const FAST_RE=/^(?:solana|sui|aptos|sei|hyperliquid|sonic|algorand|stellar|ripple|noble|near|injective|osmosis|ton|hedera|icp|canton)/i;
const BTC_RE=/^(?:bitcoin|stacks|bsquared|mezo|merlin|hemi|core|rsk|babylon|bittensor|thorchain|tron|flare|cardano)/i;
const clp=(v,a,b)=>v<a?a:v>b?b:v,r2=n=>mr(n*100)/100,r4=n=>mr(n*1e4)/1e4,cmp=(a,b)=>a<b?-1:a>b?1:0,avg=a=>a.reduce((s,v)=>s+v,0)/(a.length||1),lgT=p=>ml(mx(1,p.tvl_usd)),ctOf=p=>p.category||UC;
const fms=n=>mr(ma(n)).toLocaleString('en-US'),fU=n=>(n<0?'-':'')+'$'+fms(n),fU2=n=>(n<0?'-':'')+'$'+(ma(n)>=100?fms(n):ma(n).toFixed(2));
const mkO=(ks,vs)=>{const o={};ks.split(',').forEach((k,i)=>{o[k]=vs[i];});return o;};
const qtl=(a,q)=>{if(!a||!a.length)return 0;const s=a.slice().sort((x,y)=>x-y),p=clp(q,0,1)*(s.length-1),l=mf(p),h=M.ceil(p);return l===h?s[l]:s[l]*(1-(p-l))+s[h]*(p-l);};
const prng=sd=>{let s=(sd>>>0)||B_SEED;return()=>{s=(s+0x6D2B79F5)>>>0;let t=M.imul(s^(s>>>15),1|s);t=(t+M.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};};
const computeAgeDays=(a0,ls)=>{if(!a0||!ls)return null;const a=Date.parse(a0+'T00:00:00Z'),b=Date.parse(ls+'T00:00:00Z');return fin(a)&&fin(b)?mx(0,mf((a-b)/DAY)):null;};
const addUtcDays=(iso,d)=>new Date(Date.parse((iso||'2026-11-14')+'T00:00:00Z')+mr(d)*DAY).toISOString().slice(0,10);
const stem=s=>String(s||'').toLowerCase().replace(/-(?:v\d+(?:-\d+)?|dex|lending|lend|slipstream|basic|ignition|firm|earn|vaults|protocol|finance|network|cross-chain-bridge|bridge|aggregator|stellar|horizon-rwa|rwa)$/g,'').split('-')[0];
const K_SN='slug,name,',K_CT='category,chains,tvl_usd,',K_CL='change_7d,listed_at';
function dedupeTradedTokenAnchors(P){
const byK=new Map(),byS=new Map();
for(const p of P){
const{slug:sg,name:nm,symbol:sy,gecko_id:gk,category:ct,chains:cs,tvl_usd:tv,mcap_usd:mc,change_7d:cg,listed_at:la}=p;
if(!(mc>0&&tv>0)||ANC_EX.has(ct||'')||WRAP_RE.test(nm||'')||CEX_RE.test(nm||''))continue;
const k=String(gk||sy||sg).toLowerCase(),f=byK.get(k);
if(!f)byK.set(k,{s:sg,n:nm,y:sy||sg.toUpperCase(),g:gk,c:ct||UC,ch:(cs||[]).slice(),t:tv,m:mc,d:cg,l:la,ms:[sg],pT:tv});
else{f.t+=tv;f.m=mx(f.m,mc);f.ms.push(sg);if(tv>f.pT){f.pT=tv;f.d=cg;f.c=ct||f.c;}if(!f.l||(la&&la<f.l))f.l=la;}
}
for(const f of byK.values())if(f.y){const u=String(f.y).toUpperCase();byS.set(u,(byS.get(u)||[]).concat([f]));}
for(const p of P){
const{slug:sg,symbol:sy,category:ct,chains:cs,tvl_usd:tv,mcap_usd:mc,change_7d:cg,listed_at:la}=p;
if((mc!==null&&mc>0)||!sy||tv<=0||ANC_EX.has(ct||''))continue;
const arr=byS.get(String(sy).toUpperCase());if(!arr||arr.length!==1||stem(sg)!==stem(arr[0].s))continue;
const f=arr[0];f.t+=tv;f.ms.push(sg);for(const c of cs||[])if(!f.ch.includes(c))f.ch.push(c);
if(tv>f.pT){f.pT=tv;f.d=cg;}if(!f.l||(la&&la<f.l))f.l=la;
}
return AF(byK.values(),f=>{const t=mr(f.t),m=mr(f.m),ms=f.ms.sort(cmp);return mkO(K_SN+'symbol,gecko_id,'+K_CT+'mcap_usd,mcap_tvl_multiple,'+K_CL+',merged_slugs,merged_count',[f.s,f.n,f.y,f.g,f.c,f.ch,t,m,r4(m/t),f.d,f.l,ms,ms.length]);}).sort((a,b)=>cmp(a.slug,b.slug));
}
function selectPreTokenCandidates(S){
const m=new Map(S.protocols.map(p=>[p.slug,p])),out=new Map(),fl=S.floor_usd||5e7;
for(const s of S.watchlist||[])if(m.has(s))out.set(s,m.get(s));
for(const p of S.protocols.filter(x=>!out.has(x.slug)&&x.tvl_usd<fl&&x.gecko_id===null&&x.symbol===null&&x.mcap_usd===null&&!PRE_EX.has(x.category||'')&&!VER_RE.test(x.name||'')&&!CEX_RE.test(x.name||'')&&!WRAP_RE.test(x.name||'')&&!SLUG_RE.test(x.slug||'')).sort((a,b)=>b.tvl_usd-a.tvl_usd||cmp(a.slug,b.slug)))out.set(p.slug,p);
return AF(out.values());
}
const sCrv=a=>(a===null||!fin(a))?-0.65:(1-me(-mx(14,a)/90))-0.85*mx(0,(a-540)/1095);
const effT=(p,w)=>lgT(p)+ml(1+(clp(fin(p.change_7d)?p.change_7d:0,-25,45)/100)*w);
const rdg=(xs,x0,ys,y0,lm)=>{let n=0,d=lm;for(let i=0;i<xs.length;i++){const dx=xs[i]-x0;n+=dx*(ys[i]-y0);d+=dx*dx;}return n/d;};
function fitNestedLevel(A,asOf,lv){
const n=A.length;if(!n)return{level:0,flat_multiple:0.25,smearing_factor:1,predictLog:p=>ml(mx(1,p.tvl_usd)*0.25)};
const lT=A.map(lgT),rat=A.map((a,i)=>ml(mx(1,a.mcap_usd))-lT[i]),flat=qtl(rat,0.5);
if(lv===0)return{level:0,flat_log_mult:flat,flat_multiple:r4(me(flat)),smearing_factor:1,predictLog:p=>lgT(p)+flat};
const wF=lv>=4?0.15:0,lo=qtl(rat,0.1),hi=qtl(rat,0.9),yW=lT.map((t,i)=>t+clp(rat[i],lo,hi)),xT=A.map(a=>effT(a,wF));
const mY=avg(yW),mT=avg(xT),bT=rdg(xT,mT,yW,mY,2.5),e1=yW.map((y,i)=>y-(mY+bT*(xT[i]-mT))),kap=11,cOff=OC(),cCnt=OC();
if(lv>=2){const sum=OC();for(let i=0;i<n;i++){const c=ctOf(A[i]);sum[c]=(sum[c]||0)+e1[i];cCnt[c]=(cCnt[c]||0)+1;}for(const c of OK(sum).sort(cmp))cOff[c]=sum[c]/(cCnt[c]+kap);}
const e2=e1.map((v,i)=>v-(cOff[ctOf(A[i])]||0)),sV=A.map(a=>sCrv(computeAgeDays(asOf,a.listed_at)));
const mS=lv>=3?avg(sV):0,bS=lv>=3?rdg(sV,mS,e2,0,14):0,sm=avg(e2.map((v,i)=>me(v-(lv>=3?bS*(sV[i]-mS):0))));
const decompose=p=>{
const rT=lgT(p),bL=mY+bT*(rT-mT),gL=bT*(effT(p,wF)-rT),cL=cOff[ctOf(p)]||0,age=computeAgeDays(asOf,p.listed_at),sSc=sCrv(age),sL=lv>=3?bS*(sSc-mS):0,tot=bL+gL+cL+sL;
return{age_days:age,median_mcap_usd:mx(1,mr(me(tot))),implied_value_usd:clp(mx(1,mr(me(tot)*sm)),1,MAX_V),log_pred:tot,decomposition:mkO('base_curve_usd,category_factor,growth_factor,seasoning_factor,season_score',[mx(1,mr(me(bL)*sm)),r4(me(cL)),r4(me(gL)),r4(me(sL)),r4(sSc)])};
};
const stats=mkO('beta_tvl,beta_season,flow_weight,prior_kappa,mean_log_tvl,mean_log_mcap,mean_season,smearing_factor,flat_median_multiple,winsor_ratio_bounds',[r4(bT),r4(bS),wF,kap,r4(mT),r4(mY),r4(mS),r4(sm),r4(me(flat)),[r4(me(lo)),r4(me(hi))]]);
return OA({level:lv,flat_log_mult:flat,flat_multiple:stats.flat_median_multiple,category_offsets:cOff,category_counts:cCnt,stats,predictLog:p=>decompose(p).log_pred,decompose},stats);
}
const eSt=e=>{const md=qtl(e,0.5);return mkO('log_mae,log_mdae,log_rmse,mult_mdae_x',[r4(avg(e)),r4(md),r4(M.sqrt(avg(e.map(v=>v*v)))),r2(me(md))]);};
const impv=(b,s)=>mkO('mae_improvement_pct,mdae_improvement_pct,rmse_improvement_pct',['log_mae','log_mdae','log_rmse'].map(k=>r2(((b[k]-s[k])/b[k])*100)));
function runLeaveOneOutAudit(A,asOf){
const lbs=['M0: Flat Multiple','M1: Log-TVL Curve','M2: + Category EB','M3: + Age Seasoning','M4: + 7d Flow'];
let best=1,bM=Infinity;
const st=lbs.map((label,lv)=>{const m=eSt(A.map((a,i)=>ma(ml(mx(1,a.mcap_usd))-fitNestedLevel(A.slice(0,i).concat(A.slice(i+1)),asOf,lv).predictLog(a)))),kept=lv>=1&&m.log_mae<=bM+1e-6;if(kept){bM=m.log_mae;best=lv;}return OA({level:lv,label,kept},m);});
return OA(mkO('n_anchors,selected_level,selected_label,baseline_flat,selected_model,nested_steps',[A.length,best,st[best].label,st[0],st[best],st]),impv(st[0],st[best]));
}
function runWalkForwardAudit(A,asOf,sLv){
const lv=sLv===undefined?4:sLv,d=A.filter(a=>a.listed_at!==null).slice().sort((a,b)=>cmp(a.listed_at,b.listed_at)||cmp(a.slug,b.slug)),sp=mx(10,mf(d.length*0.6)),fE=[],mE=[];
for(let t=sp;t<d.length;t++){const tr=d.slice(0,t),y=ml(mx(1,d[t].mcap_usd));fE.push(ma(y-fitNestedLevel(tr,asOf,0).predictLog(d[t])));mE.push(ma(y-fitNestedLevel(tr,asOf,lv).predictLog(d[t])));}
const b=eSt(fE),c=eSt(mE);
return OA(mkO('n_dated_anchors,n_train_initial,n_test_out_of_time,split_listed_at,baseline_flat,comps_curve',[d.length,sp,d.length-sp,d[sp]?d[sp].listed_at:asOf,b,c]),impv(b,c));
}
function fitOnePerTickerComps(A,asOf){
const loo=runLeaveOneOutAudit(A,asOf),fit=fitNestedLevel(A,asOf,loo.selected_level),wf=runWalkForwardAudit(A,asOf,loo.selected_level);
const equation=`E[MCap|X]=${fit.smearing_factor.toFixed(2)}*exp(${fit.mean_log_mcap.toFixed(2)}+${fit.beta_tvl.toFixed(3)}*(log(TVL_eff)-${fit.mean_log_tvl.toFixed(2)})+u_cat`+(fit.level>=3?`+${fit.beta_season.toFixed(3)}*(S_age-${fit.mean_season.toFixed(2)})`:'')+')';
return{model_version:MODEL_VERSION,equation,fit,loo_audit:loo,walk_forward_audit:wf};
}
function bootstrapRankIntervals(C,A,asOf,sLv,nR,seed){
const B=nR||B_N,lv=sLv===undefined?4:sLv,rng=prng(seed||B_SEED),m=C.length,n=A.length,vs=AF({length:m},()=>new Array(B)),rk=AF({length:m},()=>new Array(B)),ix=AF({length:m},(_,i)=>i);
for(let b=0;b<B;b++){const fit=fitNestedLevel(AF({length:n},()=>A[mf(rng()*n)]),asOf,lv),cur=C.map((c,j)=>(vs[j][b]=fit.decompose(c).implied_value_usd));ix.sort((ia,ib)=>cur[ib]-cur[ia]||C[ib].tvl_usd-C[ia].tvl_usd||cmp(C[ia].slug,C[ib].slug));for(let r=0;r<m;r++)rk[ix[r]][b]=r+1;}
return new Map(C.map((c,j)=>[c.slug,mkO('p10_usd,p50_usd,p90_usd,rank_best,rank_worst',[mx(1,mr(qtl(vs[j],0.1))),mx(1,mr(qtl(vs[j],0.5))),mx(1,mr(qtl(vs[j],0.9))),mx(1,mr(qtl(rk[j],0.05))),mn(m,mr(qtl(rk[j],0.95)))])]));
}
const famOf=c=>/Curator|Allocator|Yield|Basis|Farm/.test(c)?1:/Lend|CDP|Stablecoin|Collateral/.test(c)?2:/^(?:Dexs|Derivatives|Options|Liquidity Manager|Prediction Market)$/.test(c)?3:/Restak|Staking/.test(c)?4:/^(?:RWA|CeDeFi)$/.test(c)?5:0;
function findNearestTradedComps(p,A,asOf,k){
const tL=lgT(p),tC=ctOf(p),tF=famOf(tC),tG=clp(fin(p.change_7d)?p.change_7d:-6,-25,45);
return A.map(a=>{const sm=a.category===tC,pn=sm?0:(famOf(a.category)===tF&&tF>0)?1.15:2.6;return mkO(K_SN+'symbol,category,tvl_usd,mcap_usd,mcap_tvl_multiple,merged_count,same_category,distance',[a.slug,a.name,a.symbol,a.category,a.tvl_usd,a.mcap_usd,a.mcap_tvl_multiple,a.merged_count,sm,r4(pn+ma(lgT(a)-tL)+0.005*ma(clp(fin(a.change_7d)?a.change_7d:-6,-25,45)-tG))]);}).sort((x,y)=>x.distance-y.distance||cmp(x.slug,y.slug)).slice(0,k||3);
}
const MECHS=[
[/derivative|options|prediction|otc/,'perps_clob','Perps / CLOB','USDC margin book',390,1.25,0.014,10,3.5,1.5,false,'Cap <=2x delta-neutral; avoid churn.'],
[/lend|collateral/,'lending','Lending','supply & borrow pool',300,1.12,0.032,5,1.5,1.2,false,'Keep health factor >=1.65 on collateral.'],
[/cdp|stablecoin/,'cdp_stable','CDP / Stable','mint & stability pool',320,1.15,0.03,8,1.8,1.25,false,'Verify DEX peg & redemption fees.'],
[/rwa|cedefi|insurance/,'rwa_kyc','RWA / Credit','T-bill / credit pool',195,0.9,0.037,12,1,1.1,true,'Minting often needs KYC & T+2..T+5 exit.'],
[/restak|staking|btc/,'restaking','Restaking','LRT / staking vault',280,1.05,0.028,9,1.2,1.15,false,'Note 7-14d unbonding or swap spread.'],
[/^chain$|bridge|payment|card|governance/,'l2_infra','L2 / Infra','canonical liquidity',340,1.18,0.016,8,1.5,1.3,false,'Space txs across weekly epochs.'],
];
const mkM=r=>mkO('id,label,venue_noun,base_airdrop_bps,activity_boost,native_yield_apr,entry_exit_bps,weekly_drag_bps,tx_complexity,kyc_gated,risk_note',r.slice(1));
function classifyMechanism(p){
const c=ctOf(p).toLowerCase(),h=MECHS.find(r=>r[0].test(c));if(h)return mkM(h);
const cu=/curator|allocator/.test(c),dx=/dex|liquidity/.test(c);
return mkM([0,'yield_pt_yt',cu?'ERC-4626 Vault':dx?'DEX LP':'Yield / PT-YT',cu?'ERC-4626 vault':dx?'correlated LP':'yield vault',cu?210:335,dx?1.22:1.06,cu?0.035:0.031,dx?12:6,dx?3:1.2,1.15,false,dx?'Use correlated pairs to cap IL.':'Check timelock & withdrawal depth.']);
}
function chCost(cs){
const ls=Array.isArray(cs)&&cs.length?cs:['Ethereum'],p=String(ls[0]||'Ethereum').trim(),a=ls.slice(1).map(x=>String(x||'').trim()).find(x=>L2_RE.test(x)||FAST_RE.test(x))||null;
const c=(t,al,b,g,d)=>({tier:t,pri:p,alt:al,br:b,gas:g,cad:d});
return /^ethereum$/i.test(p)?c('eth_l1',a,14,6.5,0.5):L2_RE.test(p)?c('evm_l2',null,3.2,0.18,1.5):FAST_RE.test(p)?c('fast_l1',null,1.8,0.04,2):BTC_RE.test(p)?c('btc_alt',a,9.5,1.4,0.75):c('evm_side',null,2.8,0.15,1.5);
}
function buildDepositFarmPlan(p,val,opts){
const o=opts||{},dep=mx(100,+o.deposit_usd||DEF_DEP),wks=mx(1,+o.weeks||DEF_WKS),asOf=o.as_of||'2026-11-14',imp=mx(1,typeof val==='number'?val:(val&&val.implied_value_usd)||1e7);
const m=classifyMechanism(p),ch=chCost(p.chains),ex=ch.tier==='eth_l1'&&ch.alt&&dep<=10000?ch.alt:ch.pri,uA=ex!==ch.pri,br=uA?3.4:ch.br,gx=uA?0.2:ch.gas,cad=uA?1.5:ch.cad;
const txs=mx(3,mr((2+cad*wks)*m.tx_complexity)),gBr=r2(br+txs*gx),dBp=m.entry_exit_bps+m.weekly_drag_bps*wks,exD=r2(dep*(dBp/1e4));
const gOp=r2(dep*APR*(wks/52)),yOf=r2(dep*m.native_yield_apr*(wks/52)),opp=r2(mx(0,gOp-yOf)),tC=r2(gBr+exD+opp);
const age=computeAgeDays(asOf,p.listed_at),aBp=mr(m.base_airdrop_bps*(age!==null&&age>900?0.82:age!==null&&age<180?1.08:1)),eqBp=mr(aBp*0.42),pl=imp*(aBp/1e4);
const dil=dep/(mx(1e6,(p.tvl_usd||1e6)*1.12)+dep),sW=mn(1.12,(wks/26)*m.activity_boost),grs=r2(pl*dil*sW),net=r2(grs-tC),roi=r2((net/dep)*100),uC=imp*dil*sW,be=uC>0?mn(99999,mx(1,mr((tC/uC)*1e4))):99999;
let vd='SKIP',rs=`Diluted ${fU2(grs)} < ${fU2(tC)} cost.`;
if(net>=mx(18,tC*0.35)&&!(m.kyc_gated&&dep<10000)){vd='FARM';rs=`Net EV ${fU2(net)} clears gas, drag & 4.5% USDC.`;}
else if(net>=0){vd='THIN';rs=m.kyc_gated&&dep<10000?'KYC gates make <$10k thin.':`Slim edge (${fU2(net)}); watch dilution.`;}
const mid=addUtcDays(asOf,mx(7,mr((wks*7)/2))),rev=addUtcDays(asOf,wks*7),rt=uA?`${ex} (L2)`:ex,nm=p.name;
const steps=[
`1. Check (${asOf}): DefiLlama records no token for ${nm} (${fU(p.tvl_usd)} TVL); verify contracts.`,
`2. Bridge (${fU2(br)}): Stage ${fU(dep)} on ${rt} + ~${txs} txs gas (${fU2(txs*gx)} est. fees).`,
`3. Deploy (${m.label}): Deposit ${fU(dep)} in ${nm} ${m.venue_noun}; drag ${fU2(exD)} (${r2(dBp)} bps/${wks}w).`,
`4. Cadence (${wks}w): Run ${cad>=1?mr(cad)+'x/wk':'bi-weekly'} organic txs across weekly snapshots.`,
`5. Hurdle: 4.5% USDC (${fU2(gOp)}-${fU2(yOf)}=${fU2(opp)}) -> ${fU2(tC)} cost (${be} bps break-even).`,
`6. Audit (${mid}): Re-score if ${nm} TVL +40%; gross ${fU2(grs)} -> Net EV ${fU2(net)} (${vd}).`,
`7. Exit (${rev}): Unwind via deepest pool or keep snapshot balance; ${m.risk_note}`,
];
return mkO('deposit_usd,weeks,as_of,midpoint_date,review_date,mechanism_id,mechanism_label,kyc_gated,primary_chain,execution_chain,low_fee_alt_chain,chain_tier,tx_count,airdrop_bps,equiv_fdv_bps,campaign_pool_usd,dilution_share,season_weight,gross_airdrop_usd,gas_bridge_usd,execution_drag_usd,gross_opp_cost_usd,native_yield_offset_usd,opp_cost_usd,total_cost_usd,net_ev_usd,net_roi_pct,breakeven_bps,verdict,verdict_reason,risk_note,farm_steps',[dep,wks,asOf,mid,rev,m.id,m.label,m.kyc_gated,ch.pri,ex,ch.alt,ch.tier,txs,aBp,eqBp,mr(pl),dil,r4(sW),grs,gBr,exD,gOp,yOf,opp,tC,net,roi,be,vd,rs,m.risk_note,steps]);
}
function scoreSnapshot(S,opts){
const o=opts||{},dep=o.deposit_usd||DEF_DEP,wks=o.weeks||DEF_WKS,asOf=S.as_of,wl=new Set(S.watchlist||[]),A=dedupeTradedTokenAnchors(S.protocols),bdl=fitOnePerTickerComps(A,asOf),F=bdl.fit,C=selectPreTokenCandidates(S);
const bands=bootstrapRankIntervals(C,A,asOf,bdl.loo_audit.selected_level,o.bootstrap_refits||B_N,B_SEED);
const sc=C.map(p=>{const dec=F.decompose(p),iv=dec.implied_value_usd;return{p,dec,iv,b:bands.get(p.slug),cp:findNearestTradedComps(p,A,asOf,3),fm:buildDepositFarmPlan(p,iv,{deposit_usd:dep,weeks:wks,as_of:asOf})};}).sort((a,b)=>b.iv-a.iv||b.p.tvl_usd-a.p.tvl_usd||cmp(a.p.slug,b.p.slug));
const bR=[],rR=[],cC=OC(),hC=OC(),vC={FARM:0,THIN:0,SKIP:0};let wC=0,sF=0,tI=0;
for(let i=0;i<sc.length;i++){
const{p,dec,iv,b,cp,fm}=sc[i],rk=i+1,iw=wl.has(p.slug),cat=ctOf(p);
if(iw)wC++;if(p.tvl_usd<S.floor_usd)sF++;tI+=iv;vC[fm.verdict]=(vC[fm.verdict]||0)+1;
cC[cat]=(cC[cat]||0)+1;for(const ch of p.chains)hC[ch]=(hC[ch]||0)+1;
const bs=mkO('rank,'+K_SN+K_CT+K_CL+',age_days,is_watchlist,implied_value_usd,p10_value_usd,p90_value_usd,rank_best,rank_worst',[rk,p.slug,p.name,p.category,p.chains,p.tvl_usd,p.change_7d,p.listed_at,dec.age_days,iw,iv,mn(b.p10_usd,iv),mx(b.p90_usd,iv),mn(rk,b.rank_best),mx(rk,b.rank_worst)]);
bR.push(OA({},bs,mkO('farm_verdict,net_farm_ev_usd,breakeven_bps,farm_steps',[fm.verdict,fm.net_ev_usd,fm.breakeven_bps,fm.farm_steps])));
rR.push(OA({},bs,mkO('category_label,primary_chain,cohort,token_record_note,median_mcap_usd,implied_tvl_multiple,p50_value_usd,decomposition,nearest_comps,default_farm',[cat,p.chains[0]||'Ethereum',iw?'watchlist':'discovery',`DefiLlama (${asOf}) records no token; verify first.`,dec.median_mcap_usd,r4(iv/mx(1,p.tvl_usd)),b.p50_usd,dec.decomposition,cp,fm])));
}
const cats=OK(cC).sort((a,b)=>cC[b]-cC[a]||cmp(a,b)).map(c=>mkO('category,count,anchor_count,category_factor',[c,cC[c],F.category_counts[c]||0,r4(me(F.category_offsets[c]||0))]));
const chs=OK(hC).sort((a,b)=>hC[b]-hC[a]||cmp(a,b)).map(ch=>({chain:ch,count:hC[ch]}));
return{boardRows:bR,radarData:{as_of:asOf,source:S.source,floor_usd:S.floor_usd,model_version:MODEL_VERSION,defaults:mkO('deposit_usd,weeks,deposit_presets,horizon_presets,usdc_benchmark_apr,bootstrap_refits',[dep,wks,DEPOSIT_PRESETS,HORIZON_PRESETS,APR,o.bootstrap_refits||B_N]),econometrics:OA({equation:bdl.equation,n_anchors:A.length},F.stats,{loo_cv:bdl.loo_audit,walk_forward_cv:bdl.walk_forward_audit}),summary:mkO('total_snapshot_protocols,watchlist_total,watchlist_covered,board_rows,sub_floor_discovery_rows,traded_anchor_families,total_implied_value_usd,verdict_counts',[S.protocols.length,S.watchlist.length,wC,bR.length,sF,A.length,tI,vC]),categories:cats,chains:chs,anchors:A,rows:rR}};
}
const RadarModel={MODEL_VERSION,DEPOSIT_PRESETS,HORIZON_PRESETS,DEFAULT_DEPOSIT_USD:DEF_DEP,DEFAULT_HORIZON_WEEKS:DEF_WKS,USDC_BENCHMARK_APR:APR,BOOTSTRAP_REFITS:B_N,computeAgeDays,addUtcDays,dedupeTradedTokenAnchors,selectPreTokenCandidates,fitNestedLevel,fitOnePerTickerComps,runLeaveOneOutAudit,runWalkForwardAudit,bootstrapRankIntervals,findNearestTradedComps,classifyMechanism,buildDepositFarmPlan,scoreSnapshot};
root.RadarModel=RadarModel;
if(typeof module==='object'&&module!==null&&module.exports)module.exports=RadarModel;
})(typeof globalThis!=='undefined'?globalThis:window);
