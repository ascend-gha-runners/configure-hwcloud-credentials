const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    // Get input parameters
    const region = core.getInput('region', { required: true });
    const audience = core.getInput('audience');
    const idpId = core.getInput('idp-id');
    const durationSeconds = core.getInput('duration-seconds');
    // Credentials are always masked for security
    const maskCredentials = true;

    core.debug(`Region: ${region}`);
    core.debug(`Audience: ${audience}`);
    core.debug(`IdP ID: ${idpId}`);
    core.debug(`Duration seconds: ${durationSeconds}`);

    // Step 1: Obtain GitHub OIDC token
    core.info('Obtaining GitHub OIDC token...');
    const oidcToken = await core.getIDToken(audience);
    if (!oidcToken) {
      throw new Error('Failed to obtain OIDC token');
    }

    // Mask OIDC token to prevent it from being printed in logs
    if (maskCredentials) {
      core.setSecret(oidcToken);
    }
    core.debug('OIDC token obtained');

    // Step 2: Exchange OIDC token for Huawei Cloud IAM token
    core.info('Exchanging OIDC token for Huawei Cloud IAM token...');
    const iamEndpoint = `https://iam.${region}.myhuaweicloud.com`;
    const iamTokenUrl = `${iamEndpoint}/v3.0/OS-AUTH/id-token/tokens`;

    const iamResponse = await fetch(iamTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf8',
        'X-Idp-Id': idpId,
      },
      body: JSON.stringify({
        auth: {
          id_token: {
            id: oidcToken
          }
        }
      })
    });

    if (!iamResponse.ok) {
      core.error(`IAM token exchange failed with status ${iamResponse.status}`);
      throw new Error(`IAM token exchange failed: ${iamResponse.statusText}`);
    }

    const iamToken = iamResponse.headers.get('x-subject-token');
    if (!iamToken) {
      throw new Error('No x-subject-token found in IAM response headers');
    }

    // Mask IAM token to prevent it from being printed in logs
    if (maskCredentials) {
      core.setSecret(iamToken);
    }
    core.debug('IAM token obtained');

    // Step 3: Obtain temporary AK/SK and security token
    core.info('Obtaining temporary AK/SK and security token...');
    const securityTokenUrl = `${iamEndpoint}/v3.0/OS-CREDENTIAL/securitytokens`;

    const securityTokenResponse = await fetch(securityTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ['token'],
            token: {
              id: iamToken,
              duration_seconds: parseInt(durationSeconds, 10)
            }
          }
        }
      })
    });

    if (!securityTokenResponse.ok) {
      core.error(`Security token request failed with status ${securityTokenResponse.status}`);
      throw new Error(`Security token request failed: ${securityTokenResponse.statusText}`);
    }

    const credentialData = await securityTokenResponse.json();
    const ak = credentialData.credential?.access;
    const sk = credentialData.credential?.secret;
    const st = credentialData.credential?.securitytoken;

    if (!ak || !sk || !st) {
      core.error('Invalid credential response: missing required fields');
      throw new Error('Missing required credential fields in response');
    }

    // Mask credentials in logs if enabled
    // Must be done BEFORE any logging or output that might contain them
    if (maskCredentials) {
      core.setSecret(ak);
      core.setSecret(sk);
      core.setSecret(st);
    }
    core.info('Credentials obtained and masked');

    // Set environment variables
    core.info('Setting environment variables...');
    core.exportVariable('AWS_ACCESS_KEY_ID', ak);
    core.exportVariable('AWS_SECRET_ACCESS_KEY', sk);
    core.exportVariable('AWS_SESSION_TOKEN', st);
    core.exportVariable('CLOUD_SDK_AK', ak);
    core.exportVariable('CLOUD_SDK_SK', sk);

    // Set output variables
    core.setOutput('aws-access-key-id', ak);
    core.setOutput('aws-secret-access-key', sk);
    core.setOutput('aws-session-token', st);
    core.setOutput('success', 'true');

    core.info('Credentials configured successfully');
  } catch (error) {
    // Log error but do not fail the step
    core.warning('Failed to configure Huawei Cloud credentials - subsequent steps will continue without credentials');
    core.setOutput('success', 'false');
    // Exit successfully to allow subsequent steps to run
    process.exit(0);
  }
}

run();