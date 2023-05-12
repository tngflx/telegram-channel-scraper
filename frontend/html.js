const BASE_TEMPLATE = `
<!DOCTYPE html>
<html>
    <head>
      <style>
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
      </style>
    </head>
    <body>{{0}}</body>
</html>
`;

const PHONE_FORM = `
<form action='/' method='post'>
    Phone (international format): <input name='phone' type='text' placeholder='+34600000000'>
    <input type='submit'>
</form>
`;

const CODE_FORM = `
<form action='/' method='post'>
    Telegram code: <input name='code' type='text' placeholder='70707'>
    <input type='submit'>
</form>
`;

const PASSWORD_FORM = `
<form action='/' method='post'>
    Telegram password: <input name='password' type='text' placeholder='your password (leave empty if no password)'>
    <input type='submit'>
</form>
`;

const LOADING_SCREEN = `
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



module.exports = {
    BASE_TEMPLATE, CODE_FORM, PHONE_FORM, PASSWORD_FORM
}