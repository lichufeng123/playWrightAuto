export const validLoginData = {
    prodUser:{
        phone: '13266034775',
        code: '1234',
        description: '正式环境账号 (prodUser)',
        },
    testUser:{
        phone: '13172865299',
        code: '1234',
        description: '测试环境账号 (testUser)',
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
