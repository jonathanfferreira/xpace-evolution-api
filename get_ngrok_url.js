const http = require('http');

http.get('http://localhost:4040/api/tunnels', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const tunnels = JSON.parse(data).tunnels;
            const url = tunnels.find(t => t.proto === 'https').public_url;
            console.log('NGROK_URL:' + url);
        } catch (e) {
            console.log('Error parsing ngrok response');
        }
    });
}).on('error', (err) => {
    console.log('Error reaching ngrok API');
});
