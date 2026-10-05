(() => {
 const element = document.querySelector('#coverage-map');
 const fallback = document.querySelector('#map-fallback');
 if (!element || !window.L) {if(element)element.hidden=true;if(fallback)fallback.hidden=false;return;}
 const map=L.map(element,{scrollWheelZoom:false,minZoom:7,maxZoom:15});
 map.attributionControl.setPrefix(false);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(map);
 // Rounded city-center reference points, not property boundaries or service limits.
 const cities=[['Boulder',40.015,-105.271,'left'],['Longmont',40.167,-105.102,'top'],['Louisville',39.978,-105.132,'left'],['Lafayette',39.995,-105.090,'right'],['Superior',39.953,-105.168,'bottom'],['Broomfield',39.920,-105.087,'bottom']];
 cities.forEach(([name,lat,lng,direction])=>L.marker([lat,lng],{title:name,alt:name,icon:L.divIcon({className:'coverage-city-marker',html:'<span></span>',iconSize:[12,12],iconAnchor:[6,6]})}).bindTooltip(name,{permanent:true,direction,className:'coverage-city-label'}).addTo(map));
 const fit=()=>{map.invalidateSize({pan:false});map.fitBounds(cities.map(c=>[c[1],c[2]]),{padding:[45,50],animate:false});};
 new ResizeObserver(fit).observe(element);fit();
 let loaded=false;tiles.on('tileload',()=>{loaded=true;fallback.hidden=true;});tiles.on('tileerror',()=>{if(!loaded)fallback.hidden=false;});
})();
