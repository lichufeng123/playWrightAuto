export const validLoginData = {
    normalUser:{
        phone: '13266034775',
        code: '1234',
        description: '普通用户正常登录',
        },
    vipUser:{
        phone: '13172865299',
        code: '1234',
        description: 'VIP 用户登录',
        }
    }

export const invalidLoginData = {
    wrongUser:{
        phone: '13266034775',
        code: '12',
        description: '验证码错误',
        },
    EmptyUser:{
        phone:'13266034775',
        code:'',
        description: '空验证码登录',
        }
    }