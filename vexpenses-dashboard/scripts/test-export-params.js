const API_URL = 'https://api.vexpenses.com';
const API_KEY = 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';

const baseUrl = `${API_URL}/v2/reports/export`;

const paramsList = [
  '?report_id=7603397',
  '?id=7603397',
  '?user_id=895944',
  '?format=excel',
  '?format=pdf',
  '?type=excel',
  '?report_id=7603397&format=excel',
  '?id=7603397&format=excel',
  '?reportId=7603397',
  '?report=7603397',
];

async function testParams(params) {
  try {
    const url = `${baseUrl}${params}`;
    console.log(`\nTesting: ${url}`);
    const response = await fetch(url, {
      headers: {
        'Authorization': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    console.log(`Status: ${response.status}`);
    
    if (response.status === 422) {
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 1000));
    } else if (response.ok) {
      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType);
      if (contentType && contentType.includes('json')) {
        const data = await response.json();
        console.log('JSON:', JSON.stringify(data, null, 2).substring(0, 1000));
      } else {
        const blob = await response.blob();
        console.log('Blob size:', blob.size);
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
  console.log('=== Testing /v2/reports/export params ===');
  for (const params of paramsList) {
    await testParams(params);
  }
  
  // Test POST
  console.log('\n=== Testing POST ===');
  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ report_id: 7603397 }),
      signal: AbortSignal.timeout(10000),
    });
    console.log('POST Status:', response.status);
    const data = await response.json();
    console.log('POST Response:', JSON.stringify(data, null, 2).substring(0, 1000));
  } catch (error) {
    console.log('POST Error:', error.message);
  }
}

main().catch(console.error);
