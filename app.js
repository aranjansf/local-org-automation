const puppeteer = require('puppeteer');
const { execSync } = require("child_process");
const fs = require("fs")

const sleep = (milli) => {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, milli)
    })
}

class Automate {
    constructor(_browser, _page) {

        this.page = _page
        this.browser = _browser
        this.setHostname();
        this.URLS = {
            ORG_SIGNUP: "/_ui/tenant/sfdc/signup/ui/BulkSignupUi",
            ADMIN_USERS: "/_ui/admin/user/SysAdminUserUi/l"
        }
        this.ORG_INFO = {
            // "00Dxx0000006Mt9": "https://test-1637837884901-dev-ed.my.localhost.sfdcdev.salesforce.com:6101"
        }
        //this.loginBlacktab()
    }

    setHostname() {
        let hostNamePs = execSync("hostname")
        let hostname = "https://" + hostNamePs.toString().trim() + ":6101"
        console.log({ host: hostname });
        this.hostname = hostname
    }

    async loginBlacktab() {
        await this.page.setViewport({ width: 0, height: 0 });

        await this.page.goto(this.hostname);
        await this.page.waitForSelector("#username")
        await this.page.waitForSelector("#password")
        await this.page.type("#username", "admin@bt.salesforce.com")
        await this.page.type("#password", "123456")
        // await sleep(30000)

        await this.page.waitForSelector("#Login")
        await this.page.click("#Login")

        // await this.page.waitForNavigation()
        await this.page.waitForNetworkIdle({ timeout: 60000 }) // 60 sec
        console.log("=> Login Complete");
    }

    async signup(config) {
        await this.page.goto(this.hostname + this.URLS.ORG_SIGNUP)
        // await this.page.waitForNavigation()
        await this.page.waitForNetworkIdle()
        console.log("Navigation Done");
        await this.page.type("#p2", config.name)
        await this.page.type("#username", config.username)
        await this.page.type("#email", config.email)
        await this.page.type("#p19", config.password)
        // await this.page.select("#p5", "PlanOrgEE")
        await this.page.select("#p5", "PlanOrgDE")
        // await this.page.select("#p6", "pe_lex_default")
        await this.page.select("#p6", "de_default")
        await this.page.$eval('#p22', check => check.checked = false);
        await this.page.click('input[name=save]')
        console.log("Signup pressed");
        // await this.page.waitForNetworkIdle()
        await this.page.waitForSelector("table.detailList", { timeout: 0 })
        console.log("Selector found");
        let [signupData] = await this.page.$x("//table[@class='detailList']/tbody/tr/td[@class='data2Col']")
        let text = await this.page.evaluate(element => element.innerText, signupData);

        console.log({ signup: text });
        console.log(text);
        fs.writeFileSync(`signup-${config.username}.json`, JSON.stringify(text))

        // 'username: 1637825786162@test.compassword: 123456organization id: 00Dxx0000006Mhruser id: 005xx000001XAVBclick here to login'
        // Parse this & return
    }

    async getOrgUrl(organizationId) {
        console.log("Get Org Url:", organizationId);
        await this.page.bringToFront()
        if (this.ORG_INFO[organizationId] !== undefined) {
            return this.ORG_INFO[organizationId]
        }
        let searchUrl = this.hostname + `/_ui/admin/blacktab/BlackTabHomePage/d?search=${organizationId}&search=Search`
        await this.page.goto(searchUrl)
        console.log("Page Loaded");
        const orgLinkAnchor = await this.page.$("th[scope='row'] a")
        const orgLink = await (await orgLinkAnchor.getProperty("href")).jsonValue()

        const orgLinkPage = await this.browser.newPage()
        await orgLinkPage.bringToFront()
        await orgLinkPage.goto(orgLink)
        await orgLinkPage.waitForNetworkIdle()
        // console.log("Org Page Loaded");

        // await this.page.waitForNavigation()
        // await this.page.waitForXPath("//th[@scope='row']")
        // let [orgDetailLink] = await this.page.$x("//th[@scope='row']")
        // let oldPagesNum = await this.browser.pages()
        // await orgDetailLink.click()
        // while (1) {
        //     await sleep(1000) // wait 3 sec for new tab to open
        //     let pages = await this.browser.pages()
        //     console.log("Pages:", pages.length);
        //     if (pages.length !== oldPagesNum) break
        // }
        // // await sleep(3000) // wait 3 sec for new tab to open
        // let pages = await this.browser.pages()
        // console.log("Pages:", pages.length);
        // let licenseEditorPage = pages[pages.length - 1]
        // await licenseEditorPage.setViewport({ width: 0, height: 0 });
        let pageUrl = await orgLinkPage.url()
        // console.log({ pageUrl });
        let orgUrlObj = new URL(pageUrl)
        let orgUrl = orgUrlObj.origin
        this.ORG_INFO[organizationId] = orgUrl
        return orgUrl
    }

    async addLicense(organizationId, licenseConfig) {
        let licenseEditorPage = await this.browser.newPage()
        let orgUrl = await this.getOrgUrl(organizationId)
        console.log(`OrgUrl: ${orgUrl}`);
        let licenseEditorUrl = orgUrl + "/licensing/licenseEditor.apexp"
        // console.log({
        //     pageUrl, orgUrlObj, licenseEditorUrl
        // });
        await licenseEditorPage.bringToFront()
        await licenseEditorPage.setViewport({ height: 0, width: 0 })
        await licenseEditorPage.goto(licenseEditorUrl)
        await licenseEditorPage.waitForSelector("form[name='licenseEditor:theForm']")
        let apexpDivs = await licenseEditorPage.$$("form[name='licenseEditor:theForm'] div.apexp")
        console.log(apexpDivs.length)

        //Iterate Edition
        let licenseTypes = {
            "EditionLicense": 2, "AddonLicense": 3, "PlatformLicense": 4, "UserLicense": 5
        }
        for (let key of Object.keys(licenseTypes)) {
            let licenseType = key
            let licenseDivIndex = licenseTypes[key]
            let sdiv = apexpDivs[licenseDivIndex]

            let editionRows = await sdiv.$$("table.list.container tbody tr")
            console.log({ LicenseType: key, Number: editionRows.length });
            for (let i of editionRows) {
                let tds = await i.$$("td")
                // console.log({ tds });
                // console.log(i.children[2].children[0].innerText)
                let label = await tds[2].$("label")
                let licenseName = await (await label.getProperty("innerText")).jsonValue()
                if (licenseConfig[licenseType][licenseName] === undefined) continue

                let checkDisabled = await tds[0].$eval("input", input => input.disabled)
                console.log("Disabled", checkDisabled);
                if (checkDisabled) {
                    console.log({ licenseName });
                    console.log("License was found disabled, Aborting.");
                    process.exit()
                }
                console.log({ licenseName });
                await tds[0].$eval("input", input => input.checked = true)
                await tds[1].$eval("input", input => input.value = "")
                let licenseNumInp = await tds[1].$("input")
                await licenseNumInp.type(licenseConfig[licenseType][licenseName])
                // i.children[0].children[0].checked = true
                // i.children[1].children[0].value = licenseConfig["EditionLicense"][licenseName]
            }
        }

        // Set License Expire Date
        let apexDivIndexLicenseDate = 6
        let expireDate = new Date()
        expireDate.setFullYear(expireDate.getFullYear() + 1)
        let expireDateISO = expireDate.toISOString().substring(0, 10)
        let dateParentTd = await apexpDivs[apexDivIndexLicenseDate].$("td.dataCol.first.last")
        // console.log(dateParentTd);
        dateParentTd.$eval("input", (elem, expireDateISO) => {
            elem.value = expireDateISO
        }, expireDateISO)
        let previewBtn = await apexpDivs[apexDivIndexLicenseDate].$("td.pbButtonb input")
        await previewBtn.click()
        await licenseEditorPage.waitForNavigation()
        console.log("Navigation complete");

        let saveLicenseBtn = await licenseEditorPage.$("input[value='Save Licenses']")
        await saveLicenseBtn.click()
        await licenseEditorPage.waitForNetworkIdle({ timeout: 0 })
        console.log("Licenses Saved");

        // await licenseEditorPage.waitForSelector("input[value='License Editor']")
        // console.log("License Btn Selector Found");
        // let licenseBtn = await licenseEditorPage.$("input[value='License Editor']")
        // console.log(licenseBtn);
        // await licenseBtn.click()
        // console.log("Click Done");

    }

    async setAdminUserPrefs(userPrefConfig) {
        const adminPage = await this.browser.newPage()
        await adminPage.bringToFront()
        await adminPage.setViewport({ width: 0, height: 0 });
        const adminPageUrl = this.hostname + this.URLS.ADMIN_USERS
        await adminPage.goto(adminPageUrl)
        await adminPage.waitForNetworkIdle()
        console.log("=> Admin Page Loaded");

        const tableRows = await adminPage.$$("table.list tbody tr")
        //Skip 1st row as it has headers
        console.log("Rows:", tableRows.length);
        for (let i = 1; i < tableRows.length; i++) {
            const email = await (await (await tableRows[i].$("th a")).getProperty("innerText")).jsonValue()
            // console.log({email});
            if (email !== "admin@bt.salesforce.com") continue

            const editLinkObj = await (await tableRows[i].$("td a")).getProperty("href")
            const editLink = await editLinkObj.jsonValue()
            console.log({ editLink });
            await adminPage.goto(editLink)
            await adminPage.waitForNetworkIdle()
            break
        }
        console.log("=> Edit page loaded");
        // Create a list of settings & their IDs
        const settings = {}
        let settingTable = (await adminPage.$$("table.detailList"))[1]
        let settingRows = await settingTable.$$("tbody tr")
        // Skip 4 rows, as they are dropdowns
        for (let i = 5; i < settingRows.length; i++) {
            const labelTds = await settingRows[i].$$("td.labelCol label")
            const label1Id = await (await labelTds[0].getProperty("htmlFor")).jsonValue()
            const label1Text = await (await labelTds[0].getProperty("innerText")).jsonValue()
            settings[label1Text] = label1Id
            if (labelTds.length < 2) {
                // console.log("Only 1 label", label1Text);
                continue
            }
            const label2Id = await (await labelTds[1].getProperty("htmlFor")).jsonValue()
            const label2Text = await (await labelTds[1].getProperty("innerText")).jsonValue()
            settings[label2Text] = label2Id
        }
        // console.log(settings);
        for (let key of Object.keys(userPrefConfig)) {
            if (settings[key] === undefined) {
                console.log("Admin Pref not found:", key);
                process.exit()
            }
            await adminPage.$eval(`#${settings[key]}`, (el) => {
                el.checked = true
            })
        }
        let saveBtn = await adminPage.$("input[name='save']")
        await saveBtn.click()
        await adminPage.waitForNavigation()
        console.log("=> Admin prefs saved");
        await adminPage.close()
    }

    async processOrgValRow(tr, provisionValues) {
        const tds = await tr.$$("td")
        const label1 = await tds[0].$$("label")
        if (label1.length !== 0) {
            const label1Text = await (await label1[0].getProperty("innerText")).jsonValue()
            const label1Id = await (await label1[0].getProperty("htmlFor")).jsonValue()
            provisionValues[label1Text] = label1Id
        }
        const label2 = await tds[2].$$("label")
        if (label2.length !== 0) {
            const label2Text = await (await label2[0].getProperty("innerText")).jsonValue()
            const label2Id = await (await label2[0].getProperty("htmlFor")).jsonValue()
            provisionValues[label2Text] = label2Id
        }
    }

    async setOrganizationAmounts(organizationId, provisionValConfig) {
        let orgUrl = await this.getOrgUrl(organizationId)
        const orgProvisionUrl = orgUrl + "/admin/orgProvisionEdit.jsp"
        const orgValPage = await this.browser.newPage()
        await orgValPage.bringToFront()
        await orgValPage.setViewport({ width: 0, height: 0 })
        await orgValPage.goto(orgProvisionUrl)

        const tables = await orgValPage.$$("table.detailList tbody")
        const provisionValTable = tables[2]
        const provisionValRows = await provisionValTable.$$("tr")

        const provisionValues = {}
        const promises = []
        for (let tr of provisionValRows) {
            // console.log("Process Row");
            promises.push(this.processOrgValRow(tr, provisionValues))
            // const tds = await tr.$$("td")
            // const label1 = await tds[0].$$("label")
            // if (label1.length !== 0) {
            //     const label1Text = await (await label1[0].getProperty("innerText")).jsonValue()
            //     const label1Id = await (await label1[0].getProperty("htmlFor")).jsonValue()
            //     provisionValues[label1Text] = label1Id
            // }
            // const label2 = await tds[2].$$("label")
            // if (label2.length !== 0) {
            //     const label2Text = await (await label2[0].getProperty("innerText")).jsonValue()
            //     const label2Id = await (await label2[0].getProperty("htmlFor")).jsonValue()
            //     provisionValues[label2Text] = label2Id
            // }
        }
        await Promise.all(promises)
        console.log("All rows processed");
        // console.log(provisionValues);


        for (let key of Object.keys(provisionValConfig)) {
            if (provisionValues[key] === undefined) {
                console.log("Provision Val Not Found:", key);
                process.exit()
            }
            if (provisionValConfig[key].type === "text") {
                await orgValPage.$eval(`#${provisionValues[key]}`, el => el.value = "")
                await orgValPage.type(`#${provisionValues[key]}`, provisionValConfig[key].val)
            }
            else {
                console.log("Type invalid");
            }
        }


        let saveBtn = await orgValPage.$("input[name='save']")
        await saveBtn.click()
        await orgValPage.waitForNavigation()
        console.log("=> Org Vals saved");
        await orgValPage.close()
    }

    async procesHoseMyOrgRow(label, hoseMyOrgVals) {
        const labelText = await (await label.getProperty("innerText")).jsonValue()
        const labelId = await (await label.getProperty("htmlFor")).jsonValue()
        hoseMyOrgVals[labelText] = labelId
    }

    async doHoseMyOrg(organizationId, hoseMyOrgConfig) {
        console.log("=> Hosing the org lol");
        let orgUrl = await this.getOrgUrl(organizationId)
        console.log({ orgUrl });
        const hoseMyOrgUrl = orgUrl + "/qa/hoseMyOrgPleaseSir.jsp"
        const hoseMyOrgPage = await this.browser.newPage()
        await hoseMyOrgPage.bringToFront()
        await hoseMyOrgPage.setViewport({ width: 0, height: 0 })
        await hoseMyOrgPage.goto(hoseMyOrgUrl)

        const hoseMyOrgVals = {}
        const promises = []
        const labels = await hoseMyOrgPage.$$("#permissions label")
        const labelsPrefs = await hoseMyOrgPage.$$("#preferences label")
        for (let label of labels) {
            promises.push(this.procesHoseMyOrgRow(label, hoseMyOrgVals))
            // const labelText = await (await label.getProperty("innerText")).jsonValue()
            // const labelId = await (await label.getProperty("htmlFor")).jsonValue()
            // hoseMyOrgVals[labelText] = labelId
        }
        for (let label of labelsPrefs) {
            promises.push(this.procesHoseMyOrgRow(label, hoseMyOrgVals))
            // const labelText = await (await label.getProperty("innerText")).jsonValue()
            // const labelId = await (await label.getProperty("htmlFor")).jsonValue()
            // hoseMyOrgVals[labelText] = labelId
        }
        await Promise.all(promises)
        // console.log(hoseMyOrgVals);
        for (let orgVal of Object.keys(hoseMyOrgConfig)) {
            if (hoseMyOrgVals[orgVal] === undefined) {
                console.log("OrgVal not found", orgVal);
                // process.exit()
            }
            await hoseMyOrgPage.$eval(`#${hoseMyOrgVals[orgVal]}`, el => el.checked = true)
        }

        let saveBtn = await hoseMyOrgPage.$("input[name='save']")
        await saveBtn.click()
        await hoseMyOrgPage.waitForNavigation()
        console.log("=> Org Vals saved");

    }


}



(async () => {
    try {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        let automate = new Automate(browser, page)

        let timestamp = Date.now();
        // let signupConfig = {
        //     name: `Test-${timestamp}`,
        //     username: `${timestamp}@test.com`,
        //     email: "a.ranjan@salesforce.com",
        //     password: "123456"
        // }
        let signupConfig = {
            name: `Instrumentation 240`,
            username: `inst240@test.com`,
            email: "a.ranjan@salesforce.com",
            password: "123456"
        }

        let licenseConfig = {
            EditionLicense: {
                "Developer Edition": "100"
            },
            AddonLicense: {
                "FinancialServicesCloudBasicAddOn": "10",
                "FinancialServicesCloudStandardAddOn": "10",
                "FinancialServicesForCmtyAddon": "10"
            },
            PlatformLicense: {
                "DynamicDashboards5": "5",
                "FinancialServicesforCmty": "10",
                "FinancialServicesCloudExtension": "10",
                "FSCInsurance": "10",
                "MediaCloud": "10"
            },
            UserLicense: {
                "Financial Services Cloud Basic (Permset License)": "10",
                "Financial Services Cloud Standard (Permset License)": "10",
                "Financial Services Cloud Extension (Permset License)": "10",
                "Financial Services Community (Permset License)": "10",
                "Financial Services Cloud Referral Scoring Permission Set (Permset License)": "10",
                "MarketingUser (Feature License)": "10",
                "Media Cloud Base (Permset License)": "30"
            }
        }

        let licenseConfig2 = {
            EditionLicense: {
                "Developer Edition": "100"
            },
            AddonLicense: {
                "FinancialServicesCloudBasicAddOn": "10",
                "FinancialServicesCloudStandardAddOn": "10",
                "FinancialServicesForCmtyAddon": "10",
                "APIRequestLimit1000": "1",
                "Apps250IgnoreQuantityAddOn": "1",
                "ChatterAnswersUser": "10",
                "ChatterAnswersUser": "10",
                "CRMUserAddOn": "10",
                "CustomerCommunity": "10",
                "CustomerCommunityLogin": "10",
                "CustomerCommunityPlus": "10",
                "CustomerCommunityPlusLogin": "10",
                "EinsteinAgentBasic": "1",
                "EinsteinAgentCWUBasic": "1",
                "EinsteinArticleRecommendations": "1",
                "EinsteinBuilderFree": "1",
                "EntitlementsAddOn": "1",
                "FileStorage1GB": "5",
                "FileStorageIgnoreQuantity10GB": "1",
                "FlowExecutionsUI50AddOn": "1",
                "FlowSites": "1",
                "InteractionUser": "5",
                "MarketingUser": "5",
                "MySearchAddOn": "1",
                "OfflineUser": "5",
                "PartnerCommunity": "10",
                "PartnerCommunityLogin": "10",
                "SalesConsoleUser": "10",
                "SalesforceContentUser": "10",
                "ServiceDeskUser": "10",
                "Sites24": "1",
                "SurveyUsage300ResponseLimit": "1",
                "Tabs1200IgnoreQuantityAddOn": "1"
            },
            PlatformLicense: {},
            UserLicense: {
                "Media Cloud Base (Permset License)": "100",
                "Media Cloud Plus (Permset License)": "100",
                "Enterprise Product Catalog (Permset License)": "100",
                "Ad Sales Management (Permset License)": "100",
                "Comms Cloud (Permset License)": "100"
            }
        }

        let userPrefConfig = {
            "Apex Diagnostics": true,
            "Manage Packaging": true,
            "Manage Analytics Blacktab": true,
            "Manage Application Request Router (AppRouter)": true,
            "Manage BT Partners": true,
            "Manage BT Search": true,
            "Manage Packaging": true,
            "Product Manager Restricted": true,
            "QA Diagnostics": true,
            "Run Physical Delete": true,
            "Support Diagnostics": true,
            "UI Diagnostics": true,
            "Uber: Advanced Dev Diagnostics": true,
            "Uber: Dev Diagnostics": true,
            "Enable the ability to edit licenses for Trial, Free and Demo orgs.": true
        }

        let provisionValConfig = {
            "Maximum size of Apex Code (character length, excluding comments)": {
                type: "text",
                val: "30000000"
            },
            "Apex CPU limit": {
                type: "text",
                val: "200000"
            },
            "Maximum number of custom labels per namespace": {
                type: "text",
                val: "10000"
            },
            "Platform Cache available to the Org (MB). Changes associated with purchase.": {
                type: "text",
                val: "20"
            },
            "Platform Events: Maximum number of platform events": {
                type: "text",
                val: "20"
            }
        }


        const hoseMyOrgConfig = {
            "CustomObjectLicensing": true,
            // "Forecasting3": true,
            // "Forecasting3Enable": true
        }

        const hoseMyOrgConfig240 = {
            "CustomObjectLicensing": true,
            "InteractionPlatformPilot": true,
            "OmniStudio": true
            // "Forecasting3": true,
            // "Forecasting3Enable": true
        }

        let provisionValConfig240 = {
            "Maximum size of Apex Code (character length, excluding comments)": {
                type: "text",
                val: "50000000"
            },
            "Apex CPU limit": {
                type: "text",
                val: "200000"
            },
            "Maximum number of custom labels per namespace": {
                type: "text",
                val: "100000"
            },
            "Platform Cache available to the Org (MB). Changes associated with purchase.": {
                type: "text",
                val: "20"
            },
            "Platform Events: Maximum number of platform events": {
                type: "text",
                val: "25"
            }
        }

        await automate.loginBlacktab()
        // await automate.setAdminUserPrefs(userPrefConfig)

        // await automate.addLicense("00Dxx0000006Mt9", licenseConfig)
        // await automate.setOrganizationAmounts("00Dxx0000006Mt9", provisionValConfig)
        // await automate.doHoseMyOrg("00Dxx0000006Mt9", hoseMyOrgConfig)
        // await page.goto(hostname);
        // await page.type("#username", "admin@bt.salesforce.com")
        //await browser.close();

        // await automate.setAdminUserPrefs(userPrefConfig)

        // await automate.signup(signupConfig)
        // const orgId = "00Dxx0000006Hn1" // inst240

        // await automate.addLicense(orgId, licenseConfig)
        // await automate.setOrganizationAmounts(orgId, provisionValConfig)
        // await automate.doHoseMyOrg(orgId, hoseMyOrgConfig)


        // ASM 240
        const orgId = "00Dxx0000006Hn1" // inst240
        await automate.addLicense(orgId, licenseConfig2)
        // await automate.setOrganizationAmounts(orgId, provisionValConfig240)
        // await automate.doHoseMyOrg(orgId, hoseMyOrgConfig240)


        // let orgUrl = await automate.getOrgUrl(orgId)
        // console.log({ orgUrl });

    } catch (e) {
        console.log(e);
        process.exit(2)
    }

})();