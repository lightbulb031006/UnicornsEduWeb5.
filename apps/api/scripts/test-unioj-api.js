const axios = require('axios');

const apiKey = process.env.UNIOJ_API_KEY;
const baseUrl = process.env.UNIOJ_BASE_URL || 'https://oj.uniedu.vn';
const studentName = process.env.UNIOJ_STUDENT_NAME || 'Lê Văn An';

async function test() {
  if (!apiKey) {
    throw new Error('Missing UNIOJ_API_KEY');
  }

  console.log(`1. Testing lookup for name: "${studentName}"`);
  try {
    const lookupUrl = `${baseUrl}/api/student-lookup/`;
    console.log(`GET ${lookupUrl} with name=${studentName}`);
    const res = await axios.get(lookupUrl, {
      params: { name: studentName },
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    console.log('Lookup Response Status:', res.status);
    console.log('Lookup Response Data:', JSON.stringify(res.data, null, 2));

    const username = res.data.data.username;
    if (username) {
      console.log(`\n2. Testing report JSON for username: "${username}"`);
      const reportUrl = `${baseUrl}/api/student-report/${username}/`;
      const reportRes = await axios.get(reportUrl, {
        params: { days: 90 },
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });
      console.log('Report Response Status:', reportRes.status);
      console.log('Report Response Data Keys:', Object.keys(reportRes.data));
      const rData = reportRes.data.data;
      console.log('Report Response Data nested keys:', Object.keys(rData));
      console.log('--- rData.student ---', JSON.stringify(rData.student, null, 2));
      console.log('--- rData.summary ---', JSON.stringify(rData.summary, null, 2));
      console.log('--- rData.result_breakdown ---', JSON.stringify(rData.result_breakdown, null, 2));
      console.log('--- rData.curriculum_summary ---', JSON.stringify(rData.curriculum_summary, null, 2));
      console.log('--- rData.roadmap_levels[0] ---', JSON.stringify(rData.roadmap_levels?.[0], null, 2));
      console.log('--- rData.module_rows[0] ---', JSON.stringify(rData.module_rows?.[0], null, 2));
      console.log('--- rData.daily_progress type ---', typeof rData.daily_progress);
      console.log('--- rData.daily_progress structure ---', JSON.stringify(rData.daily_progress, null, 2)?.slice(0, 1000));
      console.log('--- rData.streak ---', JSON.stringify(rData.streak, null, 2));
    }
  } catch (error) {
    console.error('Error occurred:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

test();
