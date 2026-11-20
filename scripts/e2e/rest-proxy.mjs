import http from 'node:http'
http.createServer((req, res) => {
  const path = req.url.replace(/^\/rest\/v1/, '')
  const up = http.request({ host: 'localhost', port: 54330, path, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res)
  })
  req.pipe(up)
}).listen(54331, () => console.log('proxy up'))
