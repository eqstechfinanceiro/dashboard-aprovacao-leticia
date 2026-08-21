const API_URL = 'https://api.vexpenses.com';
const API_KEY = 'N2ntX8mUF7AvjVcyT6DZwnOQXRvYgel9pCirCGKKETO5R70HEZ8UdbQA0Nt8';

const paths = [
  '/v2/reports?paginate=false&status=APROVADO&include=user',
  '/v2/reports?search=user_id:895944&searchFields=user_id:=&paginate=false',
  '/v2/reports?search=description:CAIXA&searchFields=description:like&paginate=false',
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
      signal: AbortSignal.timeout(15000),
    });
    
    console.log(`Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Total:', data.data?.length);
      if (data.data && data.data.length > 0) {
        console.log('First item keys:', Object.keys(data.data[0]));
        // Check if there are any financial fields we missed
        const first = data.data[0];
        console.log('Has total_value:', first.total_value !== undefined);
        console.log('Has amount:', first.amount !== undefined);
        console.log('Has balance:', first.balance !== undefined);
        console.log('Has value:', first.value !== undefined);
        console.log('Has pdf_link:', !!first.pdf_link);
        console.log('Has excel_link:', !!first.excel_link);
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
  console.log('=== Final endpoint tests ===');
  for (const path of paths) {
    await testPath(path);
  }
}

main().catch(console.error);
