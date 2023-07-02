const axios = require('axios');

const apiPath = 'https://webapi.mymarketing.co.il/api/smscampaign/OperationalMessage';

sendSMS = function ( phoneNumber, smsContent, req) {
    const smsData = {
        "details": {
          "name": "AAAA",
          "from_name": "CremeCarame",
          "sms_sending_profile_id": 0,
          "content": smsContent
        },
        "scheduling": {
          "send_now": true,
        },
        "mobiles": [
          {
            "phone_number": phoneNumber
          }
        ]
      };
    return axios.post(apiPath, smsData, { 
        headers: {
            "Authorization": req.app.activeTrailSecret,
          }
     })
    .then((response) => {
        if(response.status === 200){
            console.info('Successfully sent sms');
        }
    })
    .catch((err) => {
        console.log('Error sending sms:', err);
    });
    
};



getOrderRecivedContent = function (customerName, totalAmount, shippingMethod, orderId, lang) {
    const orderIdSplit = orderId.split("-");
    const idPart2 = orderIdSplit[2];
    return `היי ${customerName} - ההזמנה התקבלה בהצלחה \n ` 
    + `שיטת משלוח ${shippingMethod} \n `
    + `מספר הזמנה ${idPart2} \n`
    + `סה״כ ${totalAmount} `
}


getVerifyCodeContent = function (verifyCode) {
    return `קוד האימות שלך הוא: ${verifyCode}`;
}

const smsService = {
    sendSMS: sendSMS,
    getOrderRecivedContent: getOrderRecivedContent,
    getVerifyCodeContent: getVerifyCodeContent,
};
module.exports = smsService;
