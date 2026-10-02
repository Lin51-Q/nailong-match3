import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./e2e',fullyParallel:false,workers:2,timeout:60000,
  expect:{timeout:10000},reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4173/nailong-match3/',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium-desktop',use:{browserName:'chromium',viewport:{width:1440,height:1000}}},
    {name:'chromium-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
    {name:'webkit-mobile',use:{browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
    {name:'edge-desktop',use:{browserName:'chromium',channel:'msedge',viewport:{width:1366,height:900}}},
  ],
  webServer:{command:'npm run preview -- --port 4173 --strictPort --base=/nailong-match3/',url:'http://127.0.0.1:4173/nailong-match3/',reuseExistingServer:false},
})
