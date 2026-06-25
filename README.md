# Configure Huawei Cloud Credentials GitHub Action

This action configures Huawei Cloud OBS credentials using GitHub OIDC (OpenID Connect). It obtains temporary access keys (AK/SK) and a security token from Huawei Cloud IAM, and sets them as environment variables compatible with AWS S3 SDK tools (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) as well as Huawei Cloud SDK variables (`CLOUD_SDK_AK`, `CLOUD_SDK_SK`).

## Usage

### Prerequisites

1. Configure OIDC federation in Huawei Cloud IAM:
   - Create an identity provider (IdP) of type "OpenID Connect"
   - Set the issuer to `https://token.actions.githubusercontent.com`
   - Configure mapping rules as needed
   - Note the IdP ID (e.g., `github-vllm-ascend`) and client ID (audience) (e.g., `hw-vllm-ascend-audience`)

2. Ensure your GitHub repository/workflow has the necessary permissions:
   ```yaml
   permissions:
     id-token: write   # Required for OIDC
     contents: read
   ```

### Example Workflow

```yaml
name: Example using Huawei Cloud Credentials

on:
  push:
    branches: [ main ]

permissions:
  id-token: write
  contents: read

jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - name: Configure Huawei Cloud Credentials
        id: creds
        uses: your-org/configure-hwcloud-credentials@v1
        with:
          region: ap-southeast-1
          audience: audience
          idp-id: github-
          duration-seconds: 900

      # Now you can use the credentials in subsequent steps
      - name: List OBS buckets
        run: |
          aws s3 ls --endpoint-url https://obs.ap-southeast-1.myhuaweicloud.com
        env:
          AWS_ACCESS_KEY_ID: ${{ env.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ env.AWS_SECRET_ACCESS_KEY }}
          AWS_SESSION_TOKEN: ${{ env.AWS_SESSION_TOKEN }}
```

### Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `region` | Huawei Cloud region (e.g., `ap-southeast-1`) | Yes | - |
| `audience` | Audience for OIDC token (must match client ID configured in Huawei Cloud IdP) | No | `audience` |
| `idp-id` | Identity provider ID configured in Huawei Cloud IAM | No | `github-` |
| `duration-seconds` | Duration of temporary credentials in seconds | No | `900` |

### Outputs

| Name | Description |
|------|-------------|
| `aws-access-key-id` | Temporary access key ID |
| `aws-secret-access-key` | Temporary secret access key |
| `aws-session-token` | Temporary session token |
| `success` | `true` if credentials were successfully obtained, otherwise `false` |

### Environment Variables

The action sets the following environment variables:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `CLOUD_SDK_AK`
- `CLOUD_SDK_SK`

### Error Handling

If the action fails to obtain credentials (e.g., due to network issues, misconfiguration, or IAM errors), it will log a warning but **will not fail the step**. This ensures that subsequent steps can continue running even if credentials are unavailable. The `success` output will be set to `false` in such cases.

### Security

The action implements several security measures:

1. **Credential Masking**: All credentials (OIDC token, IAM token, AK, SK, and security token) are automatically masked using `core.setSecret()` to prevent them from being printed in logs.

2. **No Sensitive Information in Logs**: Error messages and debug logs are carefully crafted to avoid leaking any sensitive information. Response bodies from API calls are never logged.

3. **Failure Isolation**: If the action fails to obtain credentials, it exits successfully (exit code 0) to ensure subsequent workflow steps can continue running. No environment variables are set in case of failure.

4. **Input Validation**: Required parameters are validated, and API responses are checked for required fields before proceeding.

5. **Secure by Default**: Credential masking cannot be disabled - it is always enabled for security.

## Development

### Requirements

- Node.js 20 or later (the action uses Node.js 20 runtime)
- npm 7 or later (for installing dependencies)

### Building

```bash
npm install
npm run build
```

The action is built using `@vercel/ncc` to bundle all dependencies into a single file in the `dist/` directory.

### Testing

Currently, there are no automated tests. Manual testing can be performed by creating a test workflow with appropriate OIDC configuration.

## License

MIT