// No authenticated pages or API responses are cached.
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{}}catch{}
  event.waitUntil(self.registration.showNotification('UAEMUNA',{
    body:payload.body||'There’s a new message in your member hub.',
    icon:'/images/uaemuna-emblem.png',badge:'/images/uaemuna-emblem.png',
    tag:payload.tag||'uaemuna-message',data:{url:payload.url||'/dashboard/'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  let url=new URL('/dashboard/',self.location.origin);
  try{const requested=new URL(event.notification.data?.url,self.location.origin);if(requested.origin===self.location.origin&&requested.pathname==='/dashboard/')url=requested}catch{}
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    for(const client of clients)if(new URL(client.url).origin===url.origin){await client.navigate(url.href);return client.focus()}
    return self.clients.openWindow(url.href);
  }));
});
