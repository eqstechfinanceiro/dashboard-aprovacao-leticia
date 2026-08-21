const API_URL = 'https://api.vexpenses.com';
const API_KEY = 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';

const paths = [
  '/v2/reports/export/7603397',
  '/v2/reports/7603397/export',
  '/v2/reports/7603397/download',
  '/v2/reports/7603397/excel',
  '/v2/reports/7603397/pdf',
  '/v2/export/reports/7603397',
  '/v2/reports/export/7603397?format=excel',
  '/v2/reports/export/7603397?format=pdf',
];

async function testPath(path) {
  try {
    const url = `${API_URL}${path}`;
    console.log(`\nTesting: ${url}`);
    const response = await fetch(url, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    console.log(`Status: ${response.status}`);
    
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType);
      if (contentType && contentType.includes('json')) {
        const data = await response.json();
        console.log('JSON:', JSON.stringify(data, null, 2).substring(0, 1000));
      } else {
        const blob = await response.blob();
        console.log('Blob size:', blob.size);
        console.log('This could be the Excel/PDF file!');
      }
    } else {
      const text = await response.text();
      console.log('Error:', text.substring(0, 500));
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
}

async function main() {
  console.log('=== Testing export paths ===');
  for (const path of paths) {
    await testPath(path);
  }
}

main().catch(console.error);
