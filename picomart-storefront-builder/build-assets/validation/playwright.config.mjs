import {defineConfig} from '@playwright/test';
import fs from 'node:fs';
const {base}=JSON.parse(fs.readFileSync(new URL('./input.json',import.meta.url),'utf8'));
export default defineConfig({testDir:'.',testMatch:'acceptance.spec.mjs',workers:2,retries:0,timeout:30000,reporter:'list',use:{channel:process.env.PLAYWRIGHT_CHANNEL,baseURL:`http://127.0.0.1:4179${base}`,trace:'retain-on-failure'},projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],webServer:{command:`npm run preview -- --host 127.0.0.1 --port 4179 --strictPort --base=${base}`,url:`http://127.0.0.1:4179${base}`,reuseExistingServer:false,timeout:90000}});
