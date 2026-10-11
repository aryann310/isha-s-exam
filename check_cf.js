const https = require('https');

function fetchCF(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: '/client/v4/accounts/6eebbfe31dffd79ddc350f1be6218bca' + path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer d5b6515fd7d58606e2c21c046e32dff9',
        'Content-Type': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    const pages = await fetchCF('/pages/projects');
    console.log("Pages:", pages);
    const workers = await fetchCF('/workers/scripts');
    console.log("Workers:", workers);
  } catch (err) {
    console.error(err);
  }
}
main();
