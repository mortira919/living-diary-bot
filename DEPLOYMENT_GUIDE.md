# Deployment Guide for Living Diary Bot

## Issues Fixed ✅
1. **Frontend URL**: Updated from ngrok to Render URL
2. **CORS Configuration**: Added proper CORS settings
3. **Database Configuration**: Updated Prisma schema for PostgreSQL

## Remaining Steps for Render Deployment

### 1. Database Setup
You need to set up a PostgreSQL database on Render:

1. Go to your Render dashboard
2. Create a new "PostgreSQL" service
3. Copy the database URL (it will look like: `postgresql://username:password@host:port/database_name`)

### 2. Environment Variables on Render
In your Render backend service settings, add these environment variables:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
DATABASE_URL=postgresql://username:password@host:port/database_name
PORT=3001
```

### 3. Update Package.json for Production
Make sure your backend package.json has the correct start script (it already does).

### 4. Deploy and Test
1. Push your changes to GitHub
2. Render will automatically redeploy
3. Test the connection from your frontend

## Current Status
- ✅ Frontend URL fixed
- ✅ CORS configured  
- ✅ Database schema updated for PostgreSQL
- ⚠️ Need to set up PostgreSQL database on Render
- ⚠️ Need to configure environment variables on Render
