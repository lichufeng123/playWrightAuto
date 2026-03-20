pipeline {
    agent any
    options {
        timestamps()
    }
    parameters {
        string(name: 'API_URL', defaultValue: 'https://gapi-test.idealead.com/game-ai-editor-center/api/v2/workflow/invoke')
        password(name: 'API_TOKEN', defaultValue: '')
        string(name: 'CONCURRENCY', defaultValue: '10')
        string(name: 'API_TIMEOUT', defaultValue: '60')
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Python Version') {
            steps {
                powershell 'python --version'
            }
        }
        stage('Install Dependencies') {
            steps {
                powershell 'python -m pip install -r tests\\api\\requirements.txt'
            }
        }
        stage('Run API Tests') {
            steps {
                powershell '''
$env:API_URL = "${API_URL}"
$env:API_TOKEN = "${API_TOKEN}"
$env:CONCURRENCY = "${CONCURRENCY}"
$env:API_TIMEOUT = "${API_TIMEOUT}"
python -m pytest tests/api -m api --maxfail=1 --junitxml test-results/api/junit.xml
'''
            }
        }
    }
    post {
        always {
            junit allowEmptyResults: true, testResults: 'test-results/api/junit.xml'
            archiveArtifacts allowEmptyArchive: true, artifacts: 'test-results/api/**'
        }
    }
}
