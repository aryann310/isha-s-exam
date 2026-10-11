const http = require('http');

async function main() {
  // Try to hit an exam directly to see if we get a redirect or 500
  const req = http.request('http://localhost:3000/exam/cmv0hy0sy0001wt0ojsyflsxo', { method: 'GET' }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('Status:', res.statusCode, 'Headers:', res.headers, 'Body:', data.substring(0, 500)));
  });
  req.on('error', console.error);
  req.end();
}
main();
