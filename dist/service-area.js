(() => {
 const element = document.querySelector('#coverage-map');
 const fallback = document.querySelector('#map-fallback');
 if (!element || !window.L) {if(element)element.hidden=true;if(fallback)fallback.hidden=false;return;}
 const map=L.map(element,{scrollWheelZoom:false,minZoom:7,maxZoom:15,zoomSnap:.25});
 map.attributionControl.setPrefix(false);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map);
 // Rounded city-center reference points, not property boundaries or service limits.
 const cities=[['Boulder',40.015,-105.271,'left'],['Longmont',40.167,-105.102,'top'],['Louisville',39.978,-105.132,'left'],['Lafayette',39.995,-105.090,'right'],['Superior',39.953,-105.168,'left'],['Broomfield',39.920,-105.087,'bottom'],['Erie',40.050,-105.050,'right'],['Firestone',40.113,-104.937,'top'],['Frederick',40.100,-104.937,'bottom']];
 // Approximate envelope around the nine communities listed at
 // https://howardsdraperies.com/service-area/ (checked October 6, 2026).
 // A 6 km buffer rounds the outline; this is not an official service boundary.
 const referenceLat=40.05;
 const longitudeScale=Math.cos(referenceLat*Math.PI/180);
 const points=cities.flatMap(([,lat,lng])=>Array.from({length:48},(_,i)=>{
  const angle=i*Math.PI/24;
  return [lng*longitudeScale+6/111.32*Math.cos(angle),lat+6/111.32*Math.sin(angle)];
 })).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const halfHull=ordered=>{
  const hull=[];
  ordered.forEach(point=>{
   while(hull.length>1&&cross(hull[hull.length-2],hull[hull.length-1],point)<=0)hull.pop();
   hull.push(point);
  });
  return hull.slice(0,-1);
 };
 const outline=[...halfHull(points),...halfHull([...points].reverse())].map(([x,y])=>[y,x/longitudeScale]);
 const coverage=L.polygon(outline,{
  color:'#947a32',weight:3,opacity:1,fillColor:'#c2a66c',fillOpacity:.16,
  lineCap:'round',lineJoin:'round',interactive:false,className:'coverage-area-outline'
 }).addTo(map);
 cities.forEach(([name,lat,lng,direction])=>L.marker([lat,lng],{title:name,alt:name,icon:L.divIcon({className:'coverage-city-marker',html:'<span></span>',iconSize:[12,12],iconAnchor:[6,6]})}).bindTooltip(name,{permanent:true,direction,className:'coverage-city-label'}).addTo(map));
 const fit=()=>{map.invalidateSize({pan:false});map.fitBounds(coverage.getBounds(),{padding:[24,28],animate:false});};
 new ResizeObserver(fit).observe(element);fit();
 let loaded=false;tiles.on('tileload',()=>{loaded=true;fallback.hidden=true;});tiles.on('tileerror',()=>{if(!loaded)fallback.hidden=false;});
})();
