/**
 * Simple test script to verify Study Session API endpoints
 * Run this after starting the server to test the functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let sessionId = '';

// Test configuration
const testUser = {
    email: 'test@example.com',
    password: 'Test123!@#'
};

const testSession = {
    subject: 'Computer Science',
    topic: 'Data Structures - Binary Trees',
    sessionType: 'POMODORO_25',
    plannedDuration: 25,
    notes: 'Testing the study session API'
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function login() {
    try {
        console.log('🔐 Logging in...');
        const response = await axios.post(`${BASE_URL}/auth/login`, testUser);
        authToken = response.data.data.accessToken;
        console.log('✅ Login successful');
        return true;
    } catch (error) {
        console.log('❌ Login failed:', error.response?.data?.message || error.message);
        console.log('💡 Make sure you have a test user registered with email:', testUser.email);
        return false;
    }
}

async function testStartSession() {
    try {
        console.log('\n📚 Testing: Start Study Session');
        const response = await axios.post(`${BASE_URL}/sessions/start`, testSession, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        sessionId = response.data.data.sessionId;
        console.log('✅ Session started successfully');
        console.log('   Session ID:', sessionId);
        console.log('   Start Time:', response.data.data.startTime);
        return true;
    } catch (error) {
        console.log('❌ Start session failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function testGetActiveSession() {
    try {
        console.log('\n🔍 Testing: Get Active Session');
        const response = await axios.get(`${BASE_URL}/sessions/active`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        if (response.data.data) {
            console.log('✅ Active session retrieved');
            console.log('   Status:', response.data.data.status);
            console.log('   Elapsed Minutes:', response.data.data.elapsedMinutes);
            console.log('   Remaining Minutes:', response.data.data.remainingMinutes);
        } else {
            console.log('ℹ️  No active session found');
        }
        return true;
    } catch (error) {
        console.log('❌ Get active session failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function testPauseSession() {
    try {
        console.log('\n⏸️  Testing: Pause Session');
        const response = await axios.put(`${BASE_URL}/sessions/${sessionId}/pause`, {}, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log('✅ Session paused successfully');
        console.log('   Status:', response.data.data.status);
        console.log('   Paused At:', response.data.data.pausedAt);
        return true;
    } catch (error) {
        console.log('❌ Pause session failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function testResumeSession() {
    try {
        console.log('\n▶️  Testing: Resume Session');
        const response = await axios.put(`${BASE_URL}/sessions/${sessionId}/resume`, {}, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log('✅ Session resumed successfully');
        console.log('   Status:', response.data.data.status);
        console.log('   Pause Duration:', response.data.data.pauseDuration, 'seconds');
        return true;
    } catch (error) {
        console.log('❌ Resume session failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function testEndSession() {
    try {
        console.log('\n🏁 Testing: End Session');
        const response = await axios.put(`${BASE_URL}/sessions/${sessionId}/end`, {
            completed: true
        }, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log('✅ Session ended successfully');
        console.log('   Status:', response.data.data.status);
        console.log('   Total Session Minutes:', response.data.data.totalSessionMinutes);
        console.log('   Actual Study Minutes:', response.data.data.actualStudyMinutes);
        console.log('   Productivity Score:', response.data.data.productivityScore);
        return true;
    } catch (error) {
        console.log('❌ End session failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function testSessionHistory() {
    try {
        console.log('\n📊 Testing: Session History');
        const response = await axios.get(`${BASE_URL}/sessions?limit=5`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log('✅ Session history retrieved');
        console.log('   Total Sessions:', response.data.data.pagination.total);
        console.log('   Sessions in Response:', response.data.data.sessions.length);
        return true;
    } catch (error) {
        console.log('❌ Get session history failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function testAnalytics() {
    try {
        console.log('\n📈 Testing: Study Analytics');
        const response = await axios.get(`${BASE_URL}/sessions/analytics?days=7`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        
        console.log('✅ Analytics retrieved');
        console.log('   Total Sessions:', response.data.data.summary.totalSessions);
        console.log('   Total Study Hours:', response.data.data.summary.totalStudyHours);
        console.log('   Completion Rate:', response.data.data.summary.completionRate + '%');
        return true;
    } catch (error) {
        console.log('❌ Get analytics failed:', error.response?.data?.message || error.message);
        return false;
    }
}

async function runTests() {
    console.log('🚀 Starting Study Session API Tests');
    console.log('=====================================');
    
    // Login first
    const loginSuccess = await login();
    if (!loginSuccess) {
        console.log('\n❌ Cannot proceed without authentication');
        return;
    }
    
    // Run tests in sequence
    const tests = [
        testStartSession,
        testGetActiveSession,
        () => sleep(2000), // Wait 2 seconds to simulate some study time
        testPauseSession,
        () => sleep(1000), // Wait 1 second during pause
        testResumeSession,
        () => sleep(1000), // Wait 1 second more
        testEndSession,
        testSessionHistory,
        testAnalytics
    ];
    
    let passedTests = 0;
    let totalTests = tests.filter(test => test.name !== 'bound sleep').length;
    
    for (const test of tests) {
        if (test.name === 'bound sleep') {
            await test();
        } else {
            const success = await test();
            if (success) passedTests++;
        }
    }
    
    console.log('\n=====================================');
    console.log(`🎯 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed! Study Session API is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Check the error messages above.');
    }
}

// Handle command line execution
if (require.main === module) {
    runTests().catch(error => {
        console.error('💥 Test runner error:', error.message);
        process.exit(1);
    });
}

module.exports = { runTests };