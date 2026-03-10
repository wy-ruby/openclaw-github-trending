# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it to:

- Email: 906971957@qq.com
- GitHub: Create a private security advisory

Please do not create public issues for security vulnerabilities.

## Security Best Practices

### API Keys
- Store API keys in `.openclaw/openclaw.json`
- Never commit API keys to version control
- Use environment variables for development only

### Email Configuration
- Use app-specific passwords for email services
- Enable 2FA on your email account
- Consider using dedicated email services (SendGrid, Mailgun)

### Feishu Webhooks
- Keep webhook URLs private
- Rotate webhook URLs periodically
- Monitor webhook usage

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Security Updates

Security updates will be released as patch versions and announced in CHANGELOG.md.