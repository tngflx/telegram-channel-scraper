let BASE_TEMPLATE = `
<!DOCTYPE html>
<html>
   <head>
      <script>{{script}}</script>
      <style>{{style}}</style>
   </head>
   <body>{{0}}</body>
</html>
`
const db = require('../utils/db')

module.exports = {
    BASE_TEMPLATE,

    async handleAssets() {

        let css = await db.readDb('./frontend/front.css')
        let script = await db.readDb('./frontend/script.js')
        BASE_TEMPLATE = BASE_TEMPLATE.replace('{{script}}', script.trim())
        BASE_TEMPLATE = BASE_TEMPLATE.replace('{{style}}', css.trim())
        return BASE_TEMPLATE;
    },

    SUCCESS_PAGE() {
        return BASE_TEMPLATE.replace("{{0}}", "<h1>LOGGED IN SUCCESSFULLY</h1>");
    },

    FAIL_PAGE() {
        return BASE_TEMPLATE.replace("{{0}}", "<h1>LOGGED IN FAILED</h1>");
    },

    PHONE_FORM: `
    <form action='/' method='post'>
        Phone (international format): <input name='phone' type='text' placeholder='+34600000000'>
        <input type='submit'>
    </form>
    `,

    CODE_FORM: `
    <form action='/' method='post'>
        Telegram code: <input name='code' type='text' placeholder='70707'>
        <input type='submit'>
    </form>
    `,

    QR_IMAGE: `
    <div class="qr-container">
      <h1>Please scan with secondary phone!</h1>
      <img src="{{qr}}" id="qrcode"/>
    </div>
    `,

    LOADING_SCREEN: `
        <div class="loader abs-center">
          <div class="sq-wrapper">
            <div class="sq-box">
              <div class="sq-fill"></div>
            </div>
            <div class="sq-box">
              <div class="sq-fill"></div>
            </div>
            <div class="sq-box">
              <div class="sq-fill"></div>
            </div>
            <div class="sq-box">
              <div class="sq-fill"></div>
            </div>
            <div class="sq-box">
              <div class="sq-fill"></div>
            </div>
            <div class="sq-box">
              <div class="sq-fill"></div>
            </div>
          </div>
        </div>
`
}

