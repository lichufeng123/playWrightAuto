# V3.4需求PRD-会员订阅付费系统

## 5.1.6 会员订阅付费系统

### 5.1.6.1 套餐定制留资

#### 留资资料：

非必填信息：公司名称、职务信息；

必填信息：团队规模、用户姓名、用户电话、用户邮箱、团队需求；

提交按钮：点击“提交需求”，完成留资，跳转提示页面（“需求已提交，我们将在24小时内与您联系”）；

提交后，管理信息发送邮件到管理员，管理员邮箱：yaojunyi@gdinsight.com；

### 5.1.6.2 会员套餐订阅

#### 会员权限判定：

套餐绑定管理后台运营角色权限，当上架新会员权益时，前端页面需同步更新；

当用户成功购买会员时，其用户ID自动归类为会员等级权限中，每个ID仅存在于一个会员等级中：

当用户仅有一项生效会员权益时，其ID自动归位该会员内，仅享用当前的会员权益；

当用户已有低级会员权益，但在会员到期前成功升级高级会员时，则其ID自动归位高级会员内，享有高级会员权益；

当用户已有高级会员权益，但在会员到期前成功购买低级会员时，则高级会员到期后，自动将其ID归位低级会员内，享有低级会员权益；

| 当前状态 | 操作 | 新状态 | 生效时间 | ID 归属 |
| --- | --- | --- | --- | --- |
| 无会员 | 购买任意会员 | 对应等级会员 | 立即 | 新等级 |
| 低级会员 | 续费低级 | 低级会员 | 立即 | 低级 |
| 低级会员 | 升级高级 | 高级会员 | 立即 | 高级 |
| 高级会员 | 续费高级 | 高级会员 | 立即 | 高级 |
| 高级会员 | 降级低级 | 低级会员 | 到期后 | 到期后转低级 |
| 低级会员 | 再购低级 | 低级会员 | 叠加有效期 | 低级 |

flowchart TD    Start([用户购买会员]) --> CheckExisting{是否已有<br/>生效会员？}        CheckExisting -->|否 | NewMember[创建新会员记录]    NewMember --> AssignLevel[将用户 ID 归入对应<br/>会员等级]    AssignLevel --> EnjoyRights[享有对应会员权益]    EnjoyRights --> End([结束])        CheckExisting -->|是 | CheckType{购买类型？}        CheckType -->|同级续费 | ExtendPeriod[延长会员有效期]    ExtendPeriod --> EnjoyRights        CheckType -->|升级 | CheckOverlap{新旧会员期<br/>是否重叠？}    CheckOverlap -->|是 | Upgrade[升级至高级会员]    Upgrade --> MoveToHigh[将用户 ID 移至<br/>高级会员等级]    MoveToHigh --> ImmediateHigh[立即享有<br/>高级会员权益]    ImmediateHigh --> End        CheckOverlap -->|否 | NewPeriod[新会员期开始]    NewPeriod --> MoveToHigh        CheckType -->|降级 | RecordChange[记录降级变更]    RecordChange --> KeepHigh[保持高级会员权益<br/>至到期]    KeepHigh --> CheckExpiry{高级会员<br/>是否到期？}    CheckExpiry -->|否 | ContinueHigh[继续使用<br/>高级权益]    ContinueHigh --> CheckExpiry    CheckExpiry -->|是 | MoveToLow[将用户 ID 移至<br/>低级会员等级]    MoveToLow --> EnjoyLow[享有低级会员权益]    EnjoyLow --> End        CheckExisting -->|多项生效中 | ConflictCheck{是否存在<br/>权益冲突？}    ConflictCheck -->|是 | PriorityRule[按最高等级执行]    PriorityRule --> RecordAll[记录所有会员信息]    RecordAll --> AssignHighest[用户 ID 归入<br/>最高等级]    AssignHighest --> EnjoyHighest[享有最高等级权益]    EnjoyHighest --> End        ConflictCheck -->|否 | SingleEffective[仅一项生效]    SingleEffective --> AssignLevel

### 5.1.6.3 加油包/赛点包订阅

仅支持会员用户购买与使用；

购买的加油包/赛点包具有叠加权益的功能，如加油包权益，与当前会员权益叠加，同时享有最大级别权益；

加油包/赛点包支持管理后台配置，支持云控；

加油包购买弹窗显示当前‘我的积分’，左边区域可以购买对应的积分套餐：50元档、75元档、150元档等等，右边区域显示支付二维码，二维码上需用户先统一付费服务协议才可支付
