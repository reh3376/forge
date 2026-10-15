# Email Notification Service

This service sends email notifications when message queue items reach their maximum retry attempts and fail permanently.

## Configuration

Add the following environment variables to your `.env` file:

```
# Azure Communication Services for email notifications
AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING=your_connection_string_here
AZURE_COMMUNICATION_SERVICES_FROM_EMAIL=your_sender_email@yourdomain.com

# Admin emails for failure notifications
ADMIN_EMAIL_1=admin1@example.com
ADMIN_EMAIL_2=admin2@example.com
```

## How It Works

1. The system uses Azure Communication Services to send emails
2. When a message in the queue reaches its maximum retry attempts (default 3), an email notification is sent
3. Emails will be sent to both ADMIN_EMAIL_1 and ADMIN_EMAIL_2 (if configured)
4. If either email address is not provided, it will be skipped
5. The email contains details about the failed message, including its ID, topic, entity information, and error message

## Setup Instructions

1. Create an Azure Communication Services resource in your Azure portal
2. Get the connection string from the Azure portal
3. Configure a domain for sending emails through Azure Communication Services
4. Add the environment variables listed above to your deployment
5. Restart the application for the changes to take effect
