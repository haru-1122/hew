const http = require('http');
const fs = require('fs');
const path = require('path');


const saaba = http.createServer(function(req,res){
    let fairuBasho = path.join(__dirname, 'public', req.url);
    console.log(req.url)
    if(req.url ==='/'){
        fairuBasho = path.join(__dirname, 'public', 'login.html');
    }
    console.log(fairuBasho);
    fs.readFile(fairuBasho, 'utf8', function(err, naiyou){
        if(err){
            res.writeHead(404, { 'Content-type': 'text/plain'});
            res.end('Not Found');
        }else{
            res.writeHead(200,{ 'Content-type': 'text/html;charset=utf-8'});
            res.end(naiyou);
        }
    });
});

saaba.listen(3176,function(){
    console.log('サーバを起動: http://localhost:176')
})