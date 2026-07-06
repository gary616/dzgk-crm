// CRM 系统逻辑 - 自动从 app.html 提取
// 警告：此文件由脚本生成，请勿手动编辑

window.onerror=function(msg,url,line,col,err){console.error('JS ERROR:',msg,'line:',line,'col:',col,err);return false};
// ========== DATA ==========
// 销售员和内勤列表从 DB_USERS 动态获取，不再硬编码
var SALES_LIST=[];
var NQ_LIST=[];
var USERS=[
  {u:'admin',p:'admin123',r:'admin',n:'管理员',av:'A',c:'ADM'},
  {u:'sales01',p:'123456',r:'sales',n:'高恩伟',av:'高',c:'GEW'},
  {u:'sales02',p:'123456',r:'sales',n:'虞柯柯',av:'虞',c:'YKK'},
  {u:'neiqin01',p:'123456',r:'neiqin',n:'盛佳缘',av:'盛',c:'SJY'},
  {u:'neiqin02',p:'123456',r:'neiqin',n:'童清清',av:'童',c:'TQQ'},
  {u:'finance01',p:'123456',r:'finance',n:'财务专员',av:'财',c:'CW'}
];
var RN={admin:'超级管理员',sales:'销售员',neiqin:'内勤',finance:'财务',accountant:'会计'};
// 业务类型映射
var BT_MAP={new:'地址新设',renew:'地址续费',gongshang:'工商业务',xindaizhang:'新代账',daizhang_renew:'代账续费',shuiwu:'税务业务',zhuanrang:'公司转让',fangzu:'房租业务',other:'其他'};
var BT_TAGS={new:'tag-blue',renew:'tag-green'};
// 初始为空数组，强制从服务器加载数据
var DB_USERS=[];
var userPage=1;
var APPROVAL_STATUS={draft:'',pending:'待审批',approved:'已通过',rejected:'已驳回'};
// 初始为空数组，强制从服务器加载数据
// 初始为空数组，强制从服务器加载数据
var DB_ADDRESS=[];
var DB_CUSTOMERS=[];
var DB_ORDERS=[];
var DB_EXPENSES=[];
var DB_INVOICES=[];
var DB_NOTIFICATIONS=[];
var origAddrs='',origOrders='',origCusts='',origUsers='',origExp='',origInvs='',origNotifs='';
window._isEditing=false;


var DB_PERFORMANCE=[];
var curUser=null,curRole='admin',curPage='dashboard';
var isDesktop=window.__CRMDESKTOP__||(location.search.indexOf('desktop=1')!==-1)||false;
var approvalFilter='pending'; // 审批状态: pending/done/rejected
var invSelectedStatus='pending'; // 开票筛选状态: ''=全部/pending/approved/rejected
var _apprType='all'; // 审批类型筛选: all/pay/exp/inv

// ---- 列宽拖拽（主行和子行独立，互不影响） ----
(function(){
  var resizing=false,startX=0,startW=0,curTh=null,curRow=null,curType=null;
  function initResize(e){
    var target=e.target;
    if(!target.classList.contains('col-resizer'))return;
    e.preventDefault();e.stopPropagation();
    var td=target.parentElement;
    if(!td)return;
    resizing=true;startX=e.clientX;
    startW=td.offsetWidth;curTh=td;curRow=td.closest('tr');
    // 标记是主行还是子行表头
    curType=curRow.classList.contains('order-sub-header')?'sub':'main';
    target.classList.add('active');
    document.addEventListener('mousemove',doResize);
    document.addEventListener('mouseup',stopResize);
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
  }
  function doResize(e){
    if(!resizing||!curRow)return;
    var w=startW+(e.clientX-startX);
    if(w<40)w=40;
    var ci=curTh.cellIndex;
    // 只更新当前行的单元格宽度，不影响其他行
    curTh.style.width=w+'px';
    var cells=curRow.cells;
    if(cells[ci])cells[ci].style.width=w+'px';
    // 如果是表头行，同步筛选行的对应列
    if(curType==='main'){
      var filterRow=curRow.parentElement&&curRow.parentElement.querySelector('.filter-row');
      if(filterRow&&filterRow.cells[ci])filterRow.cells[ci].style.width=w+'px';
    }
    // 如果是子表头，只同步该业务编号下的子行
    if(curType==='sub'){
      var next=curRow.nextElementSibling;
      while(next&&next.classList.contains('order-child-row')){
        if(next.cells[ci])next.cells[ci].style.width=w+'px';
        next=next.nextElementSibling;
        if(next&&(next.classList.contains('order-sub-header')||next.classList.contains('order-parent-row')))break;
      }
    }
  }
  function stopResize(){
    if(!resizing)return;
    resizing=false;
    document.removeEventListener('mousemove',doResize);
    document.removeEventListener('mouseup',stopResize);
    document.body.style.cursor='';
    document.body.style.userSelect='';
    if(curTh){
      var el=curTh.querySelector('.col-resizer');
      if(el)el.classList.remove('active');
      // 保存当前列宽到localStorage
      saveColWidths();
    }
    curTh=null;curRow=null;curType=null;
  }
  function saveColWidths(){
    if(!curUser)return;
    var widths={};
    // 保存主表头列宽
    var mainHeader=document.querySelector('.data-table > thead > tr');
    if(mainHeader){
      for(var i=0;i<mainHeader.cells.length;i++){
        widths['m'+i]=mainHeader.cells[i].offsetWidth;
      }
    }
    // 保存子表头列宽
    document.querySelectorAll('.order-sub-header').forEach(function(sh,idx){
      widths['s'+idx]=[];
      for(var i=0;i<sh.cells.length;i++){
        widths['s'+idx].push(sh.cells[i].offsetWidth);
      }
    });
    localStorage.setItem('colWidths_'+curUser.username,JSON.stringify(widths));
  }
  function loadColWidths(){
    if(!curUser)return;
    var saved=localStorage.getItem('colWidths_'+curUser.username);
    if(!saved)return;
    try{
      var widths=JSON.parse(saved);
      // 恢复主表头列宽
      var mainHeader=document.querySelector('.data-table > thead > tr');
      if(mainHeader){
        for(var i=0;i<mainHeader.cells.length;i++){
          if(widths['m'+i]){
            mainHeader.cells[i].style.width=widths['m'+i]+'px';
          }
        }
        // 同步筛选行列宽
        var filterRow=mainHeader.parentElement&&mainHeader.parentElement.querySelector('.filter-row');
        if(filterRow){
          for(var fi=0;fi<filterRow.cells.length&&fi<mainHeader.cells.length;fi++){
            if(widths['m'+fi]){
              filterRow.cells[fi].style.width=widths['m'+fi]+'px';
            }
          }
        }
      }
      // 恢复子表头列宽
      var subHeaders=document.querySelectorAll('.order-sub-header');
      subHeaders.forEach(function(sh,idx){
        if(widths['s'+idx]){
          for(var i=0;i<sh.cells.length&&i<widths['s'+idx].length;i++){
            sh.cells[i].style.width=widths['s'+idx][i]+'px';
            // 同步子行
            var next=sh.nextElementSibling;
            while(next&&next.classList.contains('order-child-row')){
              if(next.cells[i])next.cells[i].style.width=widths['s'+idx][i]+'px';
              next=next.nextElementSibling;
            }
          }
        }
      });
    }catch(e){}
  }
  document.addEventListener('mousedown',function(e){
    if(e.target.classList.contains('col-resizer')){
      initResize(e);
    }
  });
  // 保存加载列宽的函数到全局
  window.loadColWidths=loadColWidths;
  var _origRender=window.renderOrdersTable;
  if(_origRender){
    window.renderOrdersTable=function(){
      _origRender.apply(this,arguments);
      // 给子表头添加拖拽把手
      var subHeaders=document.querySelectorAll('.order-sub-header td');
      for(var i=0;i<subHeaders.length;i++){
        if(subHeaders[i].querySelector('.col-resizer'))continue;
        var handle=document.createElement('div');
        handle.className='col-resizer';
        handle.title='拖拽调整宽度';
        subHeaders[i].appendChild(handle);
      }
      // 登录后加载用户列宽设置
      setTimeout(loadColWidths,100);
    };
  }
})();
var ap=1,op=1,og=1,cp=1,ip=1,ep=1,PS=15,renewDF='need';

function $(id){return document.getElementById(id)}
function fmtM(n){if(!n&&n!==0)return '\u00a5-';return '\u00a5'+Number(n).toLocaleString()}

// ========== 统一的数据读取函数（所有页面从同一数据源计算） ==========

// 获取子订单已审批通过的收款总额
// 有 pr_records 就从记录里算，没有才回退到 it.pm（老数据兼容）
function getSubPay(it){
  if(!it)return 0;
  var recs=it.pr_records||[];
  if(recs.length>0){
    var total=0;
    for(var i=0;i<recs.length;i++){if(recs[i].pf&&!recs[i].prej)total+=(recs[i].pm||0);}
    return total;
  }
  return it.pm||0;
}

// 获取子订单待审批的收款总额
function getSubPayPending(it){
  if(!it)return 0;
  var recs=it.pr_records||[];
  var total=0;
  for(var i=0;i<recs.length;i++){if(!recs[i].pf&&recs[i].pm&&!recs[i].prej)total+=(recs[i].pm||0);}
  return total;
}

// 获取子订单待审批的支出总额
function getSubExpPending(it){
  if(!it)return 0;
  var recs=it.xr||[];
  var total=0;
  for(var i=0;i<recs.length;i++){if(!recs[i].xf&&!recs[i].xrej)total+=(parseFloat(recs[i].xm_actual||recs[i].xm)||0);}
  return total;
}

// 获取子订单已审批通过的支出总额
function getSubExp(it){
  if(!it)return 0;
  var recs=it.xr||[];
  var total=0;
  for(var i=0;i<recs.length;i++){if(recs[i].xf&&!recs[i].xrej)total+=(parseFloat(recs[i].xm_actual||recs[i].xm)||0);}
  return total||it.xm||0;
}

// 判断子订单是否有已审批的收款（有 pr_records 用记录判断，没有则用 it.pm+it.pd）
function hasConfirmedPay(it){
  if(!it)return false;
  var recs=it.pr_records||[];
  if(recs.length>0)return recs.some(function(r){return r.pf&&!r.prej;});
  return it.pm>0&&it.pd;
}

function sumOrder(o){
  if(!o.items)return{pm:0,cost:0,profit:0,exp:0};
  var pm=0,cs=0,pr=0,exp=0;
  for(var i=0;i<o.items.length;i++){
    var it=o.items[i];
    // 收款：只统计已审批通过的记录（pf 存在），兼容旧数据直接用 it.pm
    var payRecs=it.pr_records||[];
    if(payRecs.length>0){
      for(var pi=0;pi<payRecs.length;pi++){
        if(payRecs[pi].pf) pm+=(parseFloat(payRecs[pi].pm)||0);
      }
    }else if(!it.pr_records){
      // 只有完全无 pr_records 的老数据才回退到 it.pm
      pm+=(it.pm||0);
    }
    cs+=(it.cost||0);
    pr+=(it.pr||0);
    // 支出：只统计已审批通过的记录（xf 存在）
    var expRecords=it.xr||[];
    for(var ri=0;ri<expRecords.length;ri++){
      if(expRecords[ri].xf){
        exp+=(parseFloat(expRecords[ri].xm)||0);
      }
    }
  }
  var profit=pm-cs-exp;
  o.pm_total=pm;
  o.cost_total=cs;
  // 如果子项没有 pr，回退到订单级 pr
  o.pr_total=pr || o.pr || 0;
  o.exp_total=exp;
  o.profit_total=profit;
  return{pm:pm,cost:cs,profit:profit,pr:pr,exp:exp};
}
// 仅统计已确认收款的订单汇总（用于业绩和总收入）
function sumConfirmedOrder(o){
  if(!o.items)return{pm:0,cost:0,profit:0,exp:0};
  var pm=0,cs=0,pr=0,exp=0,addrSaleCnt=0,addrRenewCnt=0;
  for(var i=0;i<o.items.length;i++){
    var it=o.items[i];
      // 只统计已确认的收款记录
      var payRecs=it.pr_records||[];
      var itemConfirmedPm=0;
      if(payRecs.length>0){
        for(var pi=0;pi<payRecs.length;pi++){
          if(payRecs[pi].pf&&!payRecs[pi].prej) itemConfirmedPm+=(payRecs[pi].pm||0);
        }
      }else if(!it.pr_records&&it.pm>0&&it.pd){
      // 旧数据：pm>0且有收款时间视为已确认
      itemConfirmedPm=it.pm||0;
    }
    if(itemConfirmedPm>0){
      pm+=itemConfirmedPm;
      cs+=(it.cost||0);
      if(it.bt==='renew')addrRenewCnt++;
      else addrSaleCnt++;
    }
    // 支出统计所有非驳回记录
    var expRecords=it.xr||[];
    for(var ri=0;ri<expRecords.length;ri++){
      if(expRecords[ri].xf) exp+=(parseFloat(expRecords[ri].xm)||0);
    }
  }
  var profit=pm-cs-exp;
  o.pm_total=pm;
  o.cost_total=cs;
  o.exp_total=exp;
  o.profit_total=profit;
  o._addrSaleCnt=addrSaleCnt;
  o._addrRenewCnt=addrRenewCnt;
  return{pm:pm,cost:cs,profit:profit,exp:exp};
}
function daysBetween(a,b){var d1=new Date(a||'2099-12-31'),d2=b?new Date(b):new Date();return Math.ceil((d1-d2)/86400000)}
function todayStr(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function toast(m,t){t=t||'success';var c=$('toast-container'),el=document.createElement('div');el.className='toast '+t;el.textContent=m;c.appendChild(el);setTimeout(function(){el.classList.add('leaving');setTimeout(function(){el.remove()},300)},2500)}
// 通用确认对话框 - 避免原生confirm的双击问题
// ===== 统一确认弹窗框架（支持 Enter=Escape、标题、自定义按钮） =====
function confirmDialog(msg, onOk, opt){
  opt = opt || {};
  var title = opt.title || '确认操作';
  var okText = opt.okText || '确认';
  var okClass = opt.okClass || 'btn-danger';
  var cancelText = opt.cancelText || '取消';
  var onCancel = opt.onCancel || null;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.display = 'flex';
  overlay.innerHTML = '<div class="modal-box" style="max-width:380px"><div class="modal-header"><h3>'+escHtml(title)+'</h3></div>'
    +'<div class="modal-body"><p style="font-size:14px;color:#333;margin:0">'+escHtml(msg)+'</p></div>'
    +'<div class="modal-footer"><button class="btn-secondary" id="confirm-cancel-btn">'+escHtml(cancelText)+'</button>'
    +'<button class="'+okClass+'" id="confirm-ok-btn">'+escHtml(okText)+'</button></div></div>';
  document.body.appendChild(overlay);

  function closeConfirm(){ if(document.body.contains(overlay)) overlay.remove(); }

  // 点击遮罩层关闭
  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeConfirm(); });

  document.getElementById('confirm-ok-btn').addEventListener('click', function(){
    closeConfirm();
    if(typeof onOk==='function') onOk();
  });
  document.getElementById('confirm-cancel-btn').addEventListener('click', function(){
    closeConfirm();
    if(typeof onCancel==='function') onCancel();
  });

  // 键盘支持：Enter=确认，Escape=取消
  function keyHandler(e){
    if(!document.body.contains(overlay)){ document.removeEventListener('keydown', keyHandler); return; }
    if(e.key==='Escape'){ e.preventDefault(); closeConfirm(); if(typeof onCancel==='function') onCancel(); }
    else if(e.key==='Enter'){
      var tag=document.activeElement&&document.activeElement.tagName;
      if(tag==='TEXTAREA'||tag==='SELECT') return;
      e.preventDefault();
      var btn=document.getElementById('confirm-ok-btn');
      if(btn) btn.click();
    }
  }
  document.addEventListener('keydown', keyHandler);
}
function esc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function escHtml(s){return esc(s);}

// 自然排序比较（数字部分按数值排，如 2室 < 10室 < 201室）
function naturalCmp(a,b){
  var ax=[],bx=[];
  String(a||'').replace(/(\d+)|(\D+)/g,function(_,d,w){ax.push([d||1e9,w||''])});
  String(b||'').replace(/(\d+)|(\D+)/g,function(_,d,w){bx.push([d||1e9,w||''])});
  for(var i=0;i<Math.max(ax.length,bx.length);i++){
    if(!ax[i])return -1; if(!bx[i])return 1;
    if(ax[i][0]!==1e9&&bx[i][0]!==1e9){if(ax[i][0]!==bx[i][0])return ax[i][0]-bx[i][0]}
    else{var wa=ax[i][1].toLowerCase(),wb=bx[i][1].toLowerCase();if(wa<wb)return -1;if(wa>wb)return 1}
  }
  return 0;
}

// 生成空置地址的select选项HTML（按空置优先+类型+地址+房间号排序）
// includeAddr: 编辑时需要包含当前地址（即使已占用），并设为selected
function buildVacantAddrOpts(includeAddr){
  var list=[];
  for(var k=0;k<DB_ADDRESS.length;k++){
    var va=DB_ADDRESS[k];
    var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
    if(!fullAddr)continue;
    var isVacant=!va.bn||va.bn==='';
    var isCurrent=includeAddr&&fullAddr===includeAddr;
    if(isVacant||isCurrent){
      list.push({addr:fullAddr, va:va, isVacant:isVacant, isCurrent:isCurrent});
    }
  }
  // 排序：空置在前，然后按类型、地址、房间号
  list.sort(function(x,y){
    var sx=x.isVacant?0:1, sy=y.isVacant?0:1;
    if(sx!==sy)return sx-sy;
    var tx=(x.va.t||'').toLowerCase(), ty=(y.va.t||'').toLowerCase();
    if(tx<ty)return -1; if(tx>ty)return 1;
    var ax=(x.va.ad||'').toLowerCase(), ay=(y.va.ad||'').toLowerCase();
    if(ax<ay)return -1; if(ax>ay)return 1;
    return naturalCmp(x.va.rm||'',y.va.rm||'');
  });
  var opts='<option value="">请选择地址</option>';
  for(var i=0;i<list.length;i++){
    var it=list[i];
    var suffix=it.isCurrent?' (当前)':'';
    var selected=it.isCurrent?' selected':'';
    opts+='<option value="'+esc(it.addr)+'" data-t="'+esc(it.va.t||'')+'" data-rm="'+esc(it.va.rm||'')+'" data-ac="'+esc(it.va.ac||'')+'" data-nn="'+esc(it.va.nn||'')+'" data-rt="'+esc(it.va.rt||'')+'" data-ph="'+esc(it.va.ph||'')+'" data-lp="'+esc(it.va.lp||'')+'" data-co="'+esc(it.va.co||'')+'" data-pr="'+(it.va.pr||0)+'" data-cs="'+(it.va.cs||0)+'"'+selected+'>'+esc(it.addr)+suffix+'</option>';
  }
  return {opts:opts, count:list.length};
}
// 获取已到期未续费的地址列表（用于地址续费的子订单）
function buildExpiredAddrOpts(includeAddr){
  var list=[];
  for(var k=0;k<DB_ADDRESS.length;k++){
    var va=DB_ADDRESS[k];
    var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
    if(!fullAddr)continue;
    var isExpired=va.bn&&va.bn!==''&&(va.rd<0||va.rs==='需要续费');
    var isCurrent=includeAddr&&fullAddr===includeAddr;
    if(isExpired||isCurrent){
      list.push({addr:fullAddr, va:va, isCurrent:isCurrent, isExpired:isExpired});
    }
  }
  list.sort(function(x,y){
    if(x.isCurrent&&!y.isCurrent)return -1;
    if(!x.isCurrent&&y.isCurrent)return 1;
    return naturalCmp(x.addr,y.addr);
  });
  var opts='<option value="">请选择到期地址</option>';
  for(var i=0;i<list.length;i++){
    var it=list[i];
    var suffix=it.isCurrent?' (当前)':'';
    var selected=it.isCurrent?' selected':'';
    opts+='<option value="'+esc(it.addr)+'" data-t="'+esc(it.va.t||'')+'" data-rm="'+esc(it.va.rm||'')+'" data-ac="'+esc(it.va.ac||'')+'" data-nn="'+esc(it.va.nn||'')+'" data-rt="'+esc(it.va.rt||'')+'" data-ph="'+esc(it.va.ph||'')+'" data-lp="'+esc(it.va.lp||'')+'" data-co="'+esc(it.va.co||'')+'" data-sd="'+esc(it.va.sd||'')+'" data-ed="'+esc(it.va.ed||'')+'" data-pr="'+(it.va.pr||0)+'" data-cs="'+(it.va.cs||0)+'"'+selected+'>'+esc(it.addr)+suffix+'</option>';
  }
  return {opts:opts, count:list.length};
}

// select下拉选择地址时自动填充关联字段
function onAddrSelectChange(sel, coId, phId, lpId, prId, costId){
  var opt=sel.options[sel.selectedIndex];
  if(!opt||!opt.value)return;
  var co=opt.getAttribute('data-co')||'';
  var ph=opt.getAttribute('data-ph')||'';
  var lp=opt.getAttribute('data-lp')||'';
  var pr=opt.getAttribute('data-pr')||'';
  var cs=opt.getAttribute('data-cs')||'';
  var coInput=document.getElementById(coId);
  var phInput=document.getElementById(phId);
  var lpInput=document.getElementById(lpId);
  if(coInput&&!coInput.value)coInput.value=co;
  if(phInput&&!phInput.value)phInput.value=ph;
  if(lpInput&&!lpInput.value)lpInput.value=lp;
  // 自动填充报价和成本
  if(prId){var prInput=document.getElementById(prId);if(prInput&&!prInput.value)prInput.value=pr;}
  if(costId){var costInput=document.getElementById(costId);if(costInput&&!costInput.value)costInput.value=cs;}
}

// ========== 账号下拉选项生成 ==========
// 根据业务员名称获取其收款账号下拉HTML
function buildPayAccountOpts(salesName, currentVal, fieldName){
  var user=DB_USERS.find(function(u){return u.name===salesName});
  var accounts=[];
  if(user&&user.payAccount){
    accounts=user.payAccount.split(',').map(function(a){return a.trim()}).filter(function(a){return a});
  }
  // 如果当前值不在列表中（历史数据），也加入
  if(currentVal&&accounts.indexOf(currentVal)===-1){
    accounts.push(currentVal);
  }
  var html='<select name="'+(fieldName||'pa')+'" id="'+(fieldName||'pa')+'"><option value="">请选择收款账号</option>';
  for(var i=0;i<accounts.length;i++){
    html+='<option value="'+esc(accounts[i])+'"'+(currentVal===accounts[i]?' selected':'')+'>'+esc(accounts[i])+'</option>';
  }
  html+='</select>';
  return html;
}
// 检查地址使用时长是否不足1年
function checkDurationLessThanYear(sd, ed){
  if(!sd||!ed)return false;
  var start=new Date(sd),end=new Date(ed);
  if(isNaN(start.getTime())||isNaN(end.getTime()))return false;
  var diffMs=end-start;
  var diffDays=diffMs/(1000*60*60*24);
  return diffDays<360; // 按360天算不足1年
}
// 切换业务类型时的表单联动（新增子订单用）
function switchSubOrderBizType(bt){
  // 地址相关字段
  var addrFields=['sub-addr-row','sub-rt-row','sub-ph-row','sub-lp-row','sub-sd-row','sub-ed-row'];
  var isAddrType=(bt==='new'||bt==='renew');
  for(var fi=0;fi<addrFields.length;fi++){
    var el=document.getElementById(addrFields[fi]);
    if(el)el.style.display=isAddrType?'':'none';
  }
  // 业务详情
  var bizDetail=document.getElementById('sub-bizdetail-row');
  if(bizDetail)bizDetail.style.display=isAddrType?'none':'';
  // 对接会计
  var acctRow=document.getElementById('sub-accountant-row');
  if(acctRow){
    var needAcct=(bt==='xindaizhang'||bt==='daizhang_renew'||bt==='shuiwu');
    acctRow.style.display=needAcct?'':'none';
  }
  // 如果是地址类型，初始化地址下拉
  if(isAddrType){
    var addrSel=document.getElementById('sub-addr-select');
    if(addrSel){
      if(bt==='renew'){
        var r=buildExpiredAddrOpts('');
        addrSel.innerHTML=r.opts;
        addrSel.onchange=function(){onRenewAddrSelect(this,'sub-co','sub-ph','sub-lp','sub-sd','sub-ed','sub-pr','sub-cost');};
      }else{
        var r=buildVacantAddrOpts('');
        addrSel.innerHTML=r.opts;
        addrSel.onchange=function(){onAddrSelectChange(this,'sub-co','sub-ph','sub-lp','sub-pr','sub-cost');};
      }
      addrSel.value='';
      document.getElementById('sub-co').value='';
    }
  }
  // 报价和成本：非地址类型默认留空
  var prInput=document.querySelector('[name=\"pr\"]');
  var costInput=document.querySelector('[name=\"cost\"]');
  if(!isAddrType&&prInput)prInput.value='';
  if(!isAddrType&&costInput)costInput.value='';
}
// 编辑子订单表单：切换业务类型联动
function switchEditSubOrderBizType(bt){
  var addrFields=['edit-addr-row','edit-co-row','edit-rt-row','edit-ph-row','edit-lp-row','edit-sd-row','edit-ed-row'];
  var isAddrType=(bt==='new'||bt==='renew');
  for(var fi=0;fi<addrFields.length;fi++){
    var el=document.getElementById(addrFields[fi]);
    if(el)el.style.display=isAddrType?'':'none';
  }
  var bizDetail=document.getElementById('edit-bizdetail-row');
  if(bizDetail)bizDetail.style.display=isAddrType?'none':'';
  var acctRow=document.getElementById('edit-accountant-row');
  if(acctRow){
    var needAcct=(bt==='xindaizhang'||bt==='daizhang_renew'||bt==='shuiwu');
    acctRow.style.display=needAcct?'':'none';
  }
  if(isAddrType){
    var addrSel=document.getElementById('edit-addr-select');
    if(addrSel){
      if(bt==='renew'){
        var r=buildExpiredAddrOpts('');
        addrSel.innerHTML=r.opts;
        addrSel.onchange=function(){};
      }else{
        var r=buildVacantAddrOpts('');
        addrSel.innerHTML=r.opts;
        addrSel.onchange=function(){};
      }
    }
  }
}
function onRenewAddrSelect(sel,coId,phId,lpId,sdId,edId,prId,costId){
  var opt=sel.options[sel.selectedIndex];
  if(!opt||!opt.value){if(coId)document.getElementById(coId).value='';return}
  if(coId&&opt.dataset.co)document.getElementById(coId).value=opt.dataset.co;
  if(phId&&opt.dataset.ph)document.getElementById(phId).value=opt.dataset.ph;
  if(lpId&&opt.dataset.lp)document.getElementById(lpId).value=opt.dataset.lp;
  if(sdId&&opt.dataset.ed){
    var oldEd=new Date(opt.dataset.ed);
    var newSd=new Date(oldEd);newSd.setDate(newSd.getDate()+1);
    var newEd=new Date(oldEd);newEd.setFullYear(newEd.getFullYear()+1);
    var fmt=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
    document.getElementById(sdId).value=fmt(newSd);
    document.getElementById(edId).value=fmt(newEd);
  }
  // 自动填充报价和成本
  if(prId){var prInput=document.getElementById(prId);if(prInput&&!prInput.value)prInput.value=opt.dataset.pr||'';}
  if(costId){var costInput=document.getElementById(costId);if(costInput&&!costInput.value)costInput.value=opt.dataset.cs||'';}
}
// 根据业务员名称获取其支出账号下拉HTML
function buildExpAccountOpts(salesName, currentVal, fieldName){
  var user=DB_USERS.find(function(u){return u.name===salesName});
  var accounts=[];
  if(user&&user.expAccount){
    accounts=user.expAccount.split(',').map(function(a){return a.trim()}).filter(function(a){return a});
  }
  // 如果当前值不在列表中（历史数据），也加入
  if(currentVal&&accounts.indexOf(currentVal)===-1){
    accounts.push(currentVal);
  }
  var html='<select name="'+(fieldName||'xa_actual')+'" id="'+(fieldName||'xa_actual')+'"><option value="">请选择支出账号</option>';
  for(var i=0;i<accounts.length;i++){
    html+='<option value="'+esc(accounts[i])+'"'+(currentVal===accounts[i]?' selected':'')+'>'+esc(accounts[i])+'</option>';
  }
  html+='</select>';
  return html;
}

// ========== 可调整列宽表格功能 ==========
var _colResize={active:null,startX:0,startWidth:0};

// 保存列宽配置到localStorage
function saveColWidths(key,widths){
  try{localStorage.setItem('crm_colwidth_'+key,JSON.stringify(widths));}catch(e){}
}

// 加载列宽配置从localStorage
function loadColWidths(key,defaults){
  try{
    var saved=localStorage.getItem('crm_colwidth_'+key);
    if(saved){
      var parsed=JSON.parse(saved);
      // 合并默认值和保存的值
      var result={};
      for(var k in defaults){
        result[k]=(parsed[k]!==undefined)?parsed[k]:defaults[k];
      }
      return result;
    }
  }catch(e){}
  return defaults;
}

// 初始化可调整列宽表格
function initResizableTable(containerId, widths, onChange){
  var container=document.getElementById(containerId);
  if(!container)return;
  
  // 从localStorage恢复保存的列宽
  if(!widths){
    var defaultWidths={};
    var ths=container.querySelectorAll('th');
    ths.forEach(function(th,i){defaultWidths['col_'+i]=th.offsetWidth;});
    widths=loadColWidths(containerId,defaultWidths);
  }
  if(widths){
    var ths=container.querySelectorAll('th');
    ths.forEach(function(th,i){
      var w=widths['col_'+i];
      if(w){th.style.width=w+'px';th.style.minWidth=w+'px';}
    });
    // 同步更新td宽度
    var tbody=container.querySelector('tbody');
    if(tbody){
      var tds=tbody.querySelectorAll('tr');
      tds.forEach(function(tr){
        var cells=tr.querySelectorAll('td');
        cells.forEach(function(td,i){
          var w=widths['col_'+i];
          if(w){td.style.width=w+'px';td.style.minWidth=w+'px';}
        });
      });
    }
  }
  
  var resizers=container.querySelectorAll('.col-resizer');
  resizers.forEach(function(resizer){
    resizer.addEventListener('mousedown',function(e){
      e.preventDefault();
      _colResize.active=resizer;
      _colResize.startX=e.clientX;
      _colResize.startWidth=resizer.parentElement.offsetWidth;
      document.addEventListener('mousemove',onColResize);
      document.addEventListener('mouseup',onColResizeEnd);
      resizer.classList.add('dragging');
    });
  });
  
  function onColResize(e){
    if(!_colResize.active)return;
    var th=_colResize.active.parentElement;
    var diff=e.clientX-_colResize.startX;
    var newWidth=Math.max(30,_colResize.startWidth+diff);
    th.style.width=newWidth+'px';
    th.style.minWidth=newWidth+'px';
    // 同步更新对应td的宽度
    var idx=Array.from(th.parentElement.children).indexOf(th);
    var tbody=th.closest('table').querySelector('tbody');
    if(tbody&&tbody.children[idx]){
      tbody.children[idx].style.width=newWidth+'px';
      tbody.children[idx].style.minWidth=newWidth+'px';
    }
  }
  
  function onColResizeEnd(){
    if(!_colResize.active)return;
    _colResize.active.classList.remove('dragging');
    document.removeEventListener('mousemove',onColResize);
    document.removeEventListener('mouseup',onColResizeEnd);
    
    // 保存新的列宽
    var table=document.getElementById(containerId);
    if(table){
      var newWidths={};
      var ths=table.querySelectorAll('th');
      ths.forEach(function(th,i){
        newWidths['col_'+i]=th.offsetWidth;
      });
      saveColWidths(containerId,newWidths);
      if(onChange)onChange(newWidths);
    }
    _colResize.active=null;
  }
}

function buildSalesOpts(d,fn){
  var h='<option value="">请选择</option>';
  // 从 DB_USERS 动态获取销售员列表
  var salesList=DB_USERS.filter(function(u){return u.role==='sales'}).map(function(u){return u.name});
  for(var i=0;i<salesList.length;i++){var s=salesList[i];h+='<option value="'+s+'"'+(d&&d[fn]===s?' selected':'')+'>'+s+'</option>'}
  return h
}
function buildNQOpts(d){
  var h='<option value="">请选择</option>';
  // 从 DB_USERS 动态获取内勤列表
  var nqList=DB_USERS.filter(function(u){return u.role==='neiqin'}).map(function(u){return u.name});
  for(var i=0;i<nqList.length;i++){var n=nqList[i];h+='<option value="'+n+'"'+(d&&d.nq===n?' selected':'')+'>'+n+'</option>'}
  return h
}

function fillDemo(u,p,r){}
// 根据选中的角色更新账号下拉
function updateLoginUsers(){
  var sel=$('login-username');
  if(!sel)return;
  var rt=document.querySelector('.role-tab.active'),rl=rt?rt.dataset.role:'admin';
  var cv=sel.value;
  sel.innerHTML='<option value="">请选择账号</option>';
  // 用当前 DB_USERS 或 USERS 后备
  var users=DB_USERS.length>0?DB_USERS:USERS.map(function(u){return {username:u.u,password:u.p,role:u.r,name:u.n,avatar:u.av,code:u.c||''};});
  for(var i=0;i<users.length;i++){
    if(users[i].role===rl){
      var selected=(users[i].username===cv?' selected':'');
      sel.innerHTML+='<option value="'+esc(users[i].username)+'">'+esc(users[i].name)+'</option>';
    }
  }
  onLoginUserChange();
}
function onLoginUserChange(){
  $('login-password').value='';
}
(function(){var tabs=document.querySelectorAll('.role-tab');for(var i=0;i<tabs.length;i++){tabs[i].addEventListener('click',function(){for(var j=0;j<tabs.length;j++)tabs[j].classList.remove('active');this.classList.add('active');updateLoginUsers();})}})();
$('login-password').addEventListener('keydown',function(e){if(e.key==='Enter')doLogin()});
document.addEventListener('DOMContentLoaded',async function(){
  // 先初始化登录下拉
  updateLoginUsers();
  var loginBtn=document.getElementById('btn-login');
  if(loginBtn)loginBtn.addEventListener('click',doLogin);
  // 检查自动登录，期间保持 loading，避免用户提前操作导致竞态
  await autoLogin();
  // 自动登录完成后（无论成功与否）隐藏 loading
  var lo=document.getElementById('loading-overlay');if(lo)lo.classList.add('hide');
  // 如果自动登录成功，autoLogin 内部已隐藏 login-page 并显示 main-app
  // 如果失败，login-page 保持显示（它有 class="active"）
});
// 自动登录：从 localStorage 恢复上次登录状态（有效期1天）
// 返回 true=自动登录成功进入主应用，false=需要用户手动登录
async function autoLogin(){
  var saved=null;
  try{saved=JSON.parse(localStorage.getItem('crm_login'));}catch(e){}
  if(!saved||!saved.token)return false;
  // 检查是否过期
  if(saved.expireAt&&Date.now()>saved.expireAt){
    try{localStorage.removeItem('crm_login');}catch(e){}
    return false;
  }
  // 用 token 恢复会话
  try{
    var r=await fetch('/api/session',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:saved.token}),
      signal:AbortSignal.timeout(3000)
    });
    var data=await r.json();
    if(!data.ok||!data.user){try{localStorage.removeItem('crm_login');}catch(e){}return false}
    var user=data.user;
    curUser=user;curRole=user.role;
    $('login-page').style.display='none';
    $('main-app').style.display='flex';
    // 优先初始化导航（用 session 信息），不等待数据加载完毕
    initNav();
    navigateTo('dashboard');
    await loadFromServer();
    curUser=DB_USERS.find(function(u){return u.username===user.username})||curUser;
    curRole=curUser.role;
    $('user-name').textContent=curUser.name;$('user-role').textContent=RN[curUser.role];$('user-avatar').textContent=curUser.avatar;
    origAddrs=JSON.stringify(DB_ADDRESS);origOrders=JSON.stringify(DB_ORDERS);origCusts=JSON.stringify(DB_CUSTOMERS);origUsers=JSON.stringify(DB_USERS);origExp=JSON.stringify(DB_EXPENSES);origInvs=JSON.stringify(DB_INVOICES);origNotifs=JSON.stringify(DB_NOTIFICATIONS);
    // 数据加载后重新初始化导航（更新用户权限信息）
    initNav();
    initDataPermButtons();
    updateNavBadges();
    checkEnv();
    navigateTo(curPage||'dashboard');
    updateNavBadges();
    if(window.loadColWidths)setTimeout(window.loadColWidths,200);
    window._serverVersion=0;window._isEditing=false;
    startRealtime();
    return true;  // 自动登录成功
  }catch(e){
    try{localStorage.removeItem('crm_login');}catch(e2){}
    return false;  // 网络异常等，展示登录页
  }
}
// 密码显示/隐藏切换
function togglePwdVisibility(){
  var pwdInput=document.getElementById('login-password');
  var toggle=document.getElementById('pwd-toggle');
  if(!pwdInput||!toggle)return;
  if(pwdInput.type==='password'){
    pwdInput.type='text';
    toggle.textContent='🙈';
  }else{
    pwdInput.type='password';
    toggle.textContent='👁️';
  }
}

async function doLogin(){
  var u=$('login-username').value.trim(),p=$('login-password').value,tip=$('login-tip');
  var rt=document.querySelector('.role-tab.active'),rl=rt?rt.dataset.role:'admin';
  try{
    var r=await fetch('/api/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:u,password:p,role:rl}),
      signal:AbortSignal.timeout(5000)
    });
    if(!r.ok){tip.textContent='账号或密码错误';tip.style.color='#e94560';return}
    var data=await r.json();
    if(!data.ok||!data.user){tip.textContent='账号或密码错误';tip.style.color='#e94560';return}
    var user=data.user;var token=data.token;
    tip.textContent='';curUser=user;curRole=user.role;
    // 重新登录时重置隐藏列
    localStorage.removeItem('_addrHiddenCols');
    localStorage.removeItem('_orderHiddenCols');
    // 持久化登录（存 token，不存密码）
    var expireAt=Date.now()+86400000;
    try{localStorage.setItem('crm_login',JSON.stringify({token:token,username:user.username,role:user.role,expireAt:expireAt}));}catch(e){}
  }catch(e){
    tip.textContent='无法连接服务器';tip.style.color='#e94560';return
  }
  $('login-page').style.display='none';
  // 先显示主应用框架（避免白屏），数据加载完成后自动渲染
  $('main-app').style.display='flex';
  navigateTo('dashboard');
  // 登录后立即从服务器加载最新数据（解决F5后内存重置问题）
  await loadFromServer();
  // 更新登录下拉的用户列表（给退出登录后使用）
  if(typeof updateLoginUsers==='function')updateLoginUsers();
  // 数据加载后，从 DB_USERS 中获取最新的 curUser（包含 account 等字段）
  curUser=DB_USERS.find(function(u){return u.username===user.username})||curUser;
  curRole=curUser.role;
  $('user-name').textContent=curUser.name;$('user-role').textContent=RN[curUser.role];$('user-avatar').textContent=curUser.avatar;
  origAddrs=JSON.stringify(DB_ADDRESS);origOrders=JSON.stringify(DB_ORDERS);origCusts=JSON.stringify(DB_CUSTOMERS);origUsers=JSON.stringify(DB_USERS);origExp=JSON.stringify(DB_EXPENSES);origInvs=JSON.stringify(DB_INVOICES);origNotifs=JSON.stringify(DB_NOTIFICATIONS);
  initNav();
  initDataPermButtons();
  checkEnv();
  // 显示主应用（数据加载完成后再显示）
  $('main-app').style.display='flex';
  navigateTo('dashboard');
  updateNavBadges();
  // 登录后加载用户列宽设置
  if(window.loadColWidths)setTimeout(window.loadColWidths,200);
  // 启动长轮询实时同步（替代旧的1秒轮询）
  window._serverVersion=0;
  window._isEditing=false;   // 本地编辑中标记（比旧的_localChange更精确）
  if(window._syncTimer){clearInterval(window._syncTimer);window._syncTimer=null;}
  startRealtime();
  toast('欢迎回来，'+user.name);
}
function toggleSidebar(){if(window.innerWidth<=768){var sb=$('sidebar');sb.classList.toggle('mobile-open');var m=document.querySelector('.sidebar-mask');if(!m){m=document.createElement('div');m.className='sidebar-mask';m.onclick=function(){sb.classList.remove('mobile-open');m.classList.remove('active')};document.body.appendChild(m)}m.classList.toggle('active',sb.classList.contains('mobile-open'));return}var sb=$('sidebar');sb.classList.toggle('collapsed');var mc=document.querySelector('.main-content');if(mc)mc.style.marginLeft=sb.classList.contains('collapsed')?'64px':'220px'}
function doLogout(){
  // 清理长轮询连接
  window._realtimeStop=true;
  if(window._sseSource){try{window._sseSource.close();}catch(e){}window._sseSource=null;}
  if(window._syncTimer){clearInterval(window._syncTimer);window._syncTimer=null;}
  try{localStorage.removeItem('crm_login');}catch(e){}
  curUser=null;$('main-app').style.display='none';$('login-page').style.display='block';
}

// ★ loadFromServer 精简为：仅用于登录时的初始数据加载（一次性全量拉取）
async function loadFromServer(){
  var apiBase='';
  var fromServer=false;
  try{
    // 从 localStorage 获取 token
    var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
    var _hdr={};
    if(_token)_hdr['Authorization']='Bearer '+_token;
    // 并行拉取所有数据
    var results=await Promise.all([
      fetch(apiBase+'/api/addresses',{headers:_hdr,signal:AbortSignal.timeout(5000)}).catch(function(){}),
      fetch(apiBase+'/api/orders',{headers:_hdr,signal:AbortSignal.timeout(5000)}).catch(function(){}),
      fetch(apiBase+'/api/customers',{headers:_hdr,signal:AbortSignal.timeout(5000)}).catch(function(){}),
      fetch(apiBase+'/api/expenses',{headers:_hdr,signal:AbortSignal.timeout(5000)}).catch(function(){}),
      fetch(apiBase+'/api/users',{headers:_hdr,signal:AbortSignal.timeout(5000)}).catch(function(){}),
      fetch(apiBase+'/api/invoices',{headers:_hdr,signal:AbortSignal.timeout(5000)}).catch(function(){}),
      fetch(apiBase+'/api/notifications',{headers:_hdr,signal:AbortSignal.timeout(5000)}).catch(function(){})
    ]);
    var addrRes=results[0],orderRes=results[1],custRes=results[2],expRes=results[3],userRes=results[4],invRes=results[5];
    if(addrRes&&addrRes.ok){var newAddr=await addrRes.json();if(Array.isArray(newAddr)){DB_ADDRESS=newAddr;fromServer=true;}}
    if(orderRes&&orderRes.ok){var newOrders=await orderRes.json();if(Array.isArray(newOrders)){DB_ORDERS=newOrders;fromServer=true;}}
    if(custRes&&custRes.ok){var newCusts=await custRes.json();if(Array.isArray(newCusts)){DB_CUSTOMERS=newCusts;fromServer=true;}}
    if(expRes&&expRes.ok){var newExp=await expRes.json();if(Array.isArray(newExp))DB_EXPENSES=newExp;}
    if(userRes&&userRes.ok){var usersData=await userRes.json();if(Array.isArray(usersData)){DB_USERS=usersData;fromServer=true;}}
    if(invRes&&invRes.ok){var invData=await invRes.json();if(Array.isArray(invData)){DB_INVOICES=invData;fromServer=true;}}
    var notifRes=results[7];
    if(notifRes&&notifRes.ok){var notifData=await notifRes.json();if(Array.isArray(notifData)){DB_NOTIFICATIONS=notifData;fromServer=true;}}
  }catch(e){console.warn('服务器连接失败，使用本地数据...');}
  // 服务器不可用时，从localStorage加载后备
  if(!fromServer){
    try{var lo=localStorage.getItem('crm_orders');if(lo)DB_ORDERS=JSON.parse(lo);}catch(e){}
    try{var la=localStorage.getItem('crm_address');if(la)DB_ADDRESS=JSON.parse(la);}catch(e){}
    try{var lc=localStorage.getItem('crm_customers');if(lc)DB_CUSTOMERS=JSON.parse(lc);}catch(e){}
    try{var lu=localStorage.getItem('crm_users');if(lu)DB_USERS=JSON.parse(lu);}catch(e){}
    try{var li=localStorage.getItem('crm_invoices');if(li)DB_INVOICES=JSON.parse(li);}catch(e){}
    try{var ln=localStorage.getItem('crm_notifications');if(ln)DB_NOTIFICATIONS=JSON.parse(ln);}catch(e){}
  }
  // 如果所有后备数据都为空，用本地演示账号填充 DB_USERS（确保账号管理可用）
  if(!DB_USERS||DB_USERS.length===0){
    DB_USERS=USERS.map(function(u){return {username:u.u,password:u.p,role:u.r,name:u.n,avatar:u.av,code:u.c||''};});
  }
  DB_ADDRESS.forEach(function(a){if(a.endDate)a.remainDays=daysBetween(a.endDate);});
  // 记录初始快照
  origAddrs=JSON.stringify(DB_ADDRESS);origOrders=JSON.stringify(DB_ORDERS);
  origCusts=JSON.stringify(DB_CUSTOMERS);origUsers=JSON.stringify(DB_USERS);origExp=JSON.stringify(DB_EXPENSES);
  // ★ 数据修复：纠正被错误写入地址的收款字段（从子订单收款记录同步）
  fixAddressPayData();
  // 显示服务器启动时间（即最后部署/重启时间）
  updateModifyTime();
}
function updateModifyTime(){
  fetch('/api/server-info',{signal:AbortSignal.timeout(3000)}).then(function(r){return r.json()}).then(function(d){
    var el=document.getElementById('update-time');
    if(el)el.textContent=d.startTime||'未知';
  }).catch(function(){
    var el=document.getElementById('update-time');
    if(el)el.textContent='获取失败';
  });
}
// ★ 修复地址表的收款字段（从子订单的 pr_records 同步）
function fixAddressPayData(){
  if(!DB_ORDERS||!DB_ADDRESS){console.log('[修复] 数据未就绪');return;}
  console.log('[修复] 开始检查地址收款字段... DB_ADDRESS='+DB_ADDRESS.length+'条, DB_ORDERS='+DB_ORDERS.length+'个');
  var fixed=0;
  for(var oi=0;oi<DB_ORDERS.length;oi++){
    var o=DB_ORDERS[oi];
    if(!o.items)continue;
    for(var si=0;si<o.items.length;si++){
      var it=o.items[si];
      if(!it.addr)continue;
      var payAmount=getSubPay(it);
      var hasPay=hasConfirmedPay(it);
      var payDate=hasPay?(it.pd||''):'';
      var payAccount=hasPay?(it.pa||''):'';
      var addrStr=it.addr.trim();
      for(var ai=0;ai<DB_ADDRESS.length;ai++){
        var av=DB_ADDRESS[ai];
        var fullAddr=[(av.ad||'').trim(),(av.rm||'').trim()].filter(function(x){return x}).join('');
        if(fullAddr===addrStr){
          // 只有地址当前数据明显不对（pm是支出金额而非收款金额）时才修复
          if(av.pm!==payAmount||av.pd!==payDate||av.pa!==payAccount){
            av.pm=payAmount;
            av.pd=payDate;
            av.pa=payAccount;
            fixed++;
          }
          break;
        }
      }
    }
  }
  if(fixed>0){
    // 保存到localStorage持久化
    try{localStorage.setItem('crm_address',JSON.stringify(DB_ADDRESS));}catch(e){}
    console.log('[修复] 已同步 '+fixed+' 个地址的收款字段');
    // 如果当前在地址页面，刷新显示
    if(curPage==='address'&&typeof renderAddressTable==='function')renderAddressTable();
  }
}
// ★ 同步数据到服务器 — 自动检测变更的表，只发改过的
var _syncDebounceTimer=null;
function syncAll(){
  var apiBase='';
  window._isEditing=true;
  clearTimeout(window._editingTimer);
  updateNavBadges();
  clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer=setTimeout(function(){
    var promises=[];
    // 从 localStorage 获取 token
    var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
    var _headers={'Content-Type':'application/json'};
    if(_token)_headers['Authorization']='Bearer '+_token;
    // 只发那些有变化的表（对比快照）
    if(JSON.stringify(DB_ADDRESS)!==origAddrs)promises.push(fetch(apiBase+'/api/sync/addresses',{method:'POST',headers:_headers,body:JSON.stringify(DB_ADDRESS)}).catch(function(){}));
    if(JSON.stringify(DB_ORDERS)!==origOrders)promises.push(fetch(apiBase+'/api/sync/orders',{method:'POST',headers:_headers,body:JSON.stringify(DB_ORDERS)}).catch(function(){}));
    if(JSON.stringify(DB_CUSTOMERS)!==origCusts)promises.push(fetch(apiBase+'/api/sync/customers',{method:'POST',headers:_headers,body:JSON.stringify(DB_CUSTOMERS)}).catch(function(){}));
    if(JSON.stringify(DB_EXPENSES)!==origExp)promises.push(fetch(apiBase+'/api/sync/expenses',{method:'POST',headers:_headers,body:JSON.stringify(DB_EXPENSES)}).catch(function(){}));
    if(JSON.stringify(DB_USERS)!==origUsers)promises.push(fetch(apiBase+'/api/sync/users',{method:'POST',headers:_headers,body:JSON.stringify(DB_USERS)}).catch(function(){}));
    if(JSON.stringify(DB_INVOICES)!==origInvs)promises.push(fetch(apiBase+'/api/sync/invoices',{method:'POST',headers:_headers,body:JSON.stringify(DB_INVOICES)}).catch(function(){}));
    if(JSON.stringify(DB_NOTIFICATIONS)!==origNotifs)promises.push(fetch(apiBase+'/api/sync/notifications',{method:'POST',headers:_headers,body:JSON.stringify(DB_NOTIFICATIONS)}).catch(function(){}));
    Promise.all(promises).then(function(){
      // 全部同步成功后才更新本地快照
      origAddrs=JSON.stringify(DB_ADDRESS);origOrders=JSON.stringify(DB_ORDERS);
      origCusts=JSON.stringify(DB_CUSTOMERS);origUsers=JSON.stringify(DB_USERS);
      origExp=JSON.stringify(DB_EXPENSES);origInvs=JSON.stringify(DB_INVOICES);origNotifs=JSON.stringify(DB_NOTIFICATIONS);
      window._isEditing=false;
      try{localStorage.setItem('crm_address',JSON.stringify(DB_ADDRESS));}catch(e){}
      try{localStorage.setItem('crm_orders',JSON.stringify(DB_ORDERS));}catch(e){}
      try{localStorage.setItem('crm_customers',JSON.stringify(DB_CUSTOMERS));}catch(e){}
      try{localStorage.setItem('crm_users',JSON.stringify(DB_USERS));}catch(e){}
      try{localStorage.setItem('crm_expenses',JSON.stringify(DB_EXPENSES));}catch(e){}
      try{localStorage.setItem('crm_invoices',JSON.stringify(DB_INVOICES));}catch(e){}
      updateModifyTime();
    }).catch(function(){window._isEditing=false;});
  },100);
}
// 单表快速同步 — 仅上传指定表，速度更快
var _singleSyncTimer=null;
function syncTable(table){
  var apiBase='';
  window._isEditing=true;
  clearTimeout(window._editingTimer);
  if(table==='orders'||table==='order')origOrders=JSON.stringify(DB_ORDERS);
  if(table==='address'||table==='addr')origAddrs=JSON.stringify(DB_ADDRESS);
  if(table==='customers'||table==='cust')origCusts=JSON.stringify(DB_CUSTOMERS);
  updateRenewTabBadges();
  clearTimeout(_singleSyncTimer);
  var url=table==='orders'||table==='order'?'/api/sync/orders':table==='address'||table==='addr'?'/api/sync/addresses':table==='customers'||table==='cust'?'/api/sync/customers':table==='expenses'||table==='exp'?'/api/sync/expenses':'/api/sync/users';
  var data=table==='orders'||table==='order'?DB_ORDERS:table==='address'||table==='addr'?DB_ADDRESS:table==='customers'||table==='cust'?DB_CUSTOMERS:table==='expenses'||table==='exp'?DB_EXPENSES:DB_USERS;
  _singleSyncTimer=setTimeout(function(){
    var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
    var _hdrs={'Content-Type':'application/json'};
    if(_token)_hdrs['Authorization']='Bearer '+_token;
    fetch(apiBase+url,{method:'POST',headers:_hdrs,body:JSON.stringify(data)}).then(function(){
      window._isEditing=false;
      var lskey=table==='orders'||table==='order'?'crm_orders':table==='address'||table==='addr'?'crm_address':table==='customers'||table==='cust'?'crm_customers':'crm_users';
      if(table==='expenses'||table==='exp'){window._isEditing=false;return;}
      try{localStorage.setItem(lskey,JSON.stringify(data));}catch(e){}
    }).catch(function(){window._isEditing=false;});
  },50);
}

// ========== ★ 长轮询实时同步系统（替代旧的1秒定时轮询）==========

/** 刷新当前页面的渲染 */
function refreshCurrentPage(){
  var p=curPage;
  if(p==='dashboard')renderDashboard();
  else if(p==='address')renderAddressTable();
  else if(p==='orders')renderOrdersTable();
  else if(p==='customers')renderCustomerTable();
  else if(p==='expenses')renderExpensesTable();
  else if(p==='renew')renderRenewTable();
  else if(p==='approval')renderApprovalPage();
  else if(p==='users')renderUserTable();
  else if(p==='audit')renderAuditLog();
  else if(p==='notifications')renderNotificationsPage();
  updateNotifBadge();
}

/**
 * 应用服务端推送过来的远程更新
 * 核心：只在非本地编辑状态时才替换内存数据 + 刷新UI
 */
function applyRemoteUpdate(data){
  var updated=false;
  // ★ 本地正在编辑时，不接受远程更新覆盖内存数据
  if(window._isEditing){
    return false;
  }
  // 逐表对比并更新
  if(data.addresses&&data.addresses.length!==DB_ADDRESS.length){
    DB_ADDRESS=data.addresses;updated=true;
  }else if(data.addresses&&JSON.stringify(data.addresses)!==origAddrs){
    DB_ADDRESS=data.addresses;updated=true;
  }
  if(data.orders&&data.orders.length!==DB_ORDERS.length){
    DB_ORDERS=data.orders;updated=true;
  }else if(data.orders&&JSON.stringify(data.orders)!==origOrders){
    DB_ORDERS=data.orders;updated=true;
  }
  if(data.customers&&data.customers.length!==DB_CUSTOMERS.length){
    DB_CUSTOMERS=data.customers;updated=true;
  }else if(data.customers&&JSON.stringify(data.customers)!==origCusts){
    DB_CUSTOMERS=data.customers;updated=true;
  }
  // users 始终同步（因为其他管理员可能改权限等）
  if(data.users&&data.users.length>0){
    if(JSON.stringify(data.users)!==origUsers){
      DB_USERS=data.users;updated=true;
      // 如果当前用户信息变了（比如权限修改），刷新用户显示
      var updatedMe=DB_USERS.find(function(u){return u.username===curUser.username});
      if(updatedMe){curUser=updatedMe;$('user-name').textContent=curUser.name;$('user-role').textContent=RN[curUser.role];$('user-avatar').textContent=curUser.avatar;}
    }
  }
  if(data.expenses){
    var origExpStr=JSON.stringify(DB_EXPENSES);
    if(JSON.stringify(data.expenses)!==origExpStr){
      DB_EXPENSES=data.expenses;updated=true;
    }
  }
  if(data.invoices){
    var origInvStr=JSON.stringify(DB_INVOICES);
    if(JSON.stringify(data.invoices)!==origInvStr){
      DB_INVOICES=data.invoices;updated=true;
    }
  }
  if(data.notifications){
    var origNotStr=JSON.stringify(DB_NOTIFICATIONS);
    if(JSON.stringify(data.notifications)!==origNotStr){
      DB_NOTIFICATIONS=data.notifications;updated=true;
      updateNotifBadge();
    }
  }
  // 更新快照
  origAddrs=JSON.stringify(DB_ADDRESS);origOrders=JSON.stringify(DB_ORDERS);
  origCusts=JSON.stringify(DB_CUSTOMERS);origUsers=JSON.stringify(DB_USERS);origExp=JSON.stringify(DB_EXPENSES);
  origInvs=JSON.stringify(DB_INVOICES);origNotifs=JSON.stringify(DB_NOTIFICATIONS);
  // 处理日期字段
  DB_ADDRESS.forEach(function(a){if(a.endDate)a.remainDays=daysBetween(a.endDate);});
  // 只在确实有变化且不在本地编辑时才刷新UI
  if(updated&&!window._isEditing){
    refreshCurrentPage();
  }else if(updated&&window._isEditing){
    console.log('[RT] 收到远程更新但本地正在编辑，暂不刷新UI（数据已更新到内存）');
  }
  return updated;
}

/**
 * 长轮询主循环
 * 工作原理：
 *   1. 向 /api/updates?v=当前版本号 发请求
 *   2. 服务端有新版本 → 立即返回最新全量数据 → 应用 → 重新连接
 *   3. 服务端无新数据 → hold住最多30秒 → 超时返回空 → 重新连接
 *   4. 断网/异常 → 等2秒后自动重连
 *
 * 对比旧方案的优势：
 *   - 不再每秒全量拉取，只有数据真变了才有流量
 *   - 不存在竞态条件：syncAll bump版本后服务端才会返回新数据
 *   - _isEditing 精确控制：本地编辑时跳过UI刷新但数据仍入内存
 */
/* ----- 环境检测（测试版/正式版）----- */
async function checkEnv(){
  try{
    var r=await fetch('/api/env',{signal:AbortSignal.timeout(3000)});
    if(!r.ok)return;
    var data=await r.json();
    if(data.env==='dev'){
      var badge=document.getElementById('env-badge');
      if(badge){badge.style.display='inline';badge.textContent='DEV'}
      var banner=document.getElementById('env-top-banner');
      if(banner)banner.classList.add('show');
      document.title='[测试] '+document.title;
    }
  }catch(e){}
}
/* ----- 实时数据更新（长轮询）----- */
/* ----- 实时数据更新（长轮询）----- */
function startRealtime(){
  window._realtimeStop=false;
  // 按表版本号
  if(!window._tableVersions){
    window._tableVersions={addresses:0,orders:0,customers:0,expenses:0,users:0,invoices:0,notifications:0};
  }
  // 使用长轮询（避免SSE导致浏览器tab加载转圈）
  startLongPollRealtime();
}
function startLongPollRealtime(){
  window._realtimeStop=false;
  if(!window._tableVersions){
    window._tableVersions={addresses:0,orders:0,customers:0,expenses:0,users:0,invoices:0,notifications:0};
  }
  (async function loop(){
    while(!window._realtimeStop){
      try{
        var apiBase='';
        var tvStr='';
        try{tvStr='&tv='+encodeURIComponent(JSON.stringify(window._tableVersions));}catch(e){}
        var url=apiBase+'/api/updates?v='+window._serverVersion+tvStr;
        console.log('[RT] 长轮询 v='+window._serverVersion);
        var r=await fetch(url,{signal:AbortSignal.timeout(35000)});
        var data=await r.json();
        if(data.version>window._serverVersion){
          console.log('[RT] 更新 v'+window._serverVersion+'→v'+data.version);
          window._serverVersion=data.version;
          if(data._changed){
            for(var ci=0;ci<data._changed.length;ci++){
              var tbl=data._changed[ci];
              window._tableVersions[tbl]=(window._tableVersions[tbl]||0)+1;
            }
          }
          applyRemoteUpdate(data);
        }else{
          console.log('[RT] 版本未变 v='+data.version);
        }
      }catch(e){
        if(window._realtimeStop)return;
        console.warn('[RT] 连接中断，2秒后重连...',e.message||e);
        await new Promise(function(res){setTimeout(res,2000);});
      }
    }
    console.log('[RT] 长轮询已停止');
  })();
}

function initNav(){
  var items=document.querySelectorAll('.nav-item');
  var userPerms=curUser&&curUser.permissions?curUser.permissions:[];
  // 角色默认权限表，当用户权限缺失时作为兜底；且与用户权限取并集确保角色基础功能不丢失
  var roleDefaults={
    admin:['dashboard','address','renew','orders','customers','performance','income','expenses','invoice','approval','salary','users','audit'],
    gm:['dashboard','address','renew','orders','customers','performance','income','expenses','invoice','approval','salary'],
    finance:['dashboard','address','renew','orders','customers','performance','income','expenses','invoice','approval','salary'],
    sales:['dashboard','address','renew','orders','customers','performance','invoice'],
    neiqin:['dashboard','address','renew','orders','customers','approval'],
    accountant:['dashboard','income','expenses']
  };
  var rolePerms=roleDefaults[curUser&&curUser.role]||[];
  for(var i=0;i<items.length;i++){
    var item=items[i];
    var page=item.dataset.page;
    // 设置页面仅桌面版显示
    if(page==='settings'){
      item.style.display=window.isDesktop?'flex':'none';
      continue;
    }
    // admin/gm 角色拥有所有权限
    if(curUser.role==='admin'||curUser.role==='gm'){
      item.style.display='flex';
    } else {
      // 根据权限配置显示/隐藏（取角色默认权限 + 用户权限的并集）
      if(page&&page!=='dashboard'&&page!=='login'){
        item.style.display=(rolePerms.indexOf(page)!==-1||userPerms.indexOf(page)!==-1)?'flex':'none';
      } else {
        item.style.display='flex';
      }
    }
  }
}
function hasPermission(page){
  if(!curUser)return false;
  if(curUser.role==='admin'||curUser.role==='gm')return true;
  return curUser.permissions&&curUser.permissions.indexOf(page)!==-1;
}
function navigateTo(page){
  // 切换页面时关闭所有筛选弹出面板
  closeFilterPopup();
  closeOrderFilterPopup();
  closeGFilterPopup();
  curPage=page;
  var items=document.querySelectorAll('.nav-item');for(var i=0;i<items.length;i++)items[i].classList.toggle('active',items[i].dataset.page===page);
  var pages=document.querySelectorAll('.content-page');for(var i=0;i<pages.length;i++)pages[i].classList.toggle('active',pages[i].id==='page-'+page);
  var navItem=document.querySelector('[data-page="'+page+'"]');var navText=navItem?navItem.querySelector('.nav-text'):'';
  $('topbar-breadcrumb').textContent=navText?navText.textContent:page;
  var sb=document.getElementById('sidebar');if(sb)sb.classList.remove('mobile-open');
  var mk=document.querySelector('.sidebar-mask');if(mk)mk.classList.remove('active');
  if(page==='dashboard')renderDashboard();else if(page==='address')renderAddressTable();else if(page==='renew')renderRenewTable();
  else if(page==='orders')renderOrdersTable();else if(page==='customers')renderCustomerTable();else if(page==='users')renderUserTable();else if(page==='performance')renderPerformance();
  else if(page==='contract')loadContractPage();
  else if(page==='income')renderIncomeTable();else if(page==='expenses'){
    // 销售角色隐藏新增支出按钮
    var expAddBtn=document.getElementById('exp-add-btn');
    if(expAddBtn)expAddBtn.style.display=curRole==='sales'?'none':'inline-block';
    renderExpensesTable();
  }else if(page==='approval')renderApprovalPage();
  else if(page==='settings')loadConfig();
  else if(page==='invoice')renderInvoicePage();
  else if(page==='audit'){if(curRole==='admin')renderAuditLog();else navigateTo('dashboard');}
  else if(page==='notifications')renderNotificationsPage();
  else if(page==='contracts')renderContractsPage();
  else if(page==='salary'){
    // 管理员/财务显示提成设置按钮
    var btn=document.getElementById('salary-set-rates-btn');
    if(btn)btn.style.display=(curRole==='admin'||curRole==='finance'||curRole==='gm')?'inline-block':'none';
    renderSalaryPage();
  }
  return false;
}
// 显示/隐藏数据导入导出按钮（仅管理员和财务可见）
function initDataPermButtons(){
  var show=curRole==='admin'||curRole==='finance';
  var ids=['addr-download-template','addr-import','addr-export',
    'order-download-template','order-import','order-export',
    'cust-download-template','cust-import','cust-export',
    'salary-export','exp-export','income-export'];
  for(var i=0;i<ids.length;i++){
    var el=document.getElementById(ids[i]);
    if(el)el.style.display=show?'inline-block':'none';
  }
}
function toggleMobileSidebar(){var s=document.getElementById('sidebar');s.classList.toggle('mobile-open');var m=document.querySelector('.sidebar-mask');if(!m){m=document.createElement('div');m.className='sidebar-mask';m.onclick=function(){s.classList.remove('mobile-open');m.classList.remove('active')};document.body.appendChild(m)}m.classList.toggle('active',s.classList.contains('mobile-open'))}
setInterval(function(){var d=new Date();$('topbar-time').textContent=d.toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'})+' '+d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})},1000);

function renderDashboard(){
  try{
  var myOrders=DB_ORDERS,myAddrs=DB_ADDRESS;
  if(curRole==='sales'){myOrders=myOrders.filter(function(o){return o.sl===curUser.name});myAddrs=myAddrs.filter(function(a){return a.sl===curUser.name})}
  // 根据角色显示/隐藏看板元素
  var isAdmin=(curRole==='admin'),isSales=(curRole==='sales'),isNeiqin=(curRole==='neiqin'),isFinance=(curRole==='finance');
  // 统计卡片
  $('stat-total-orders').textContent=myOrders.length;
  var ti=0;for(var i=0;i<myOrders.length;i++){sumOrder(myOrders[i]);ti+=(myOrders[i].pm_total||0)}$('stat-total-income').textContent=fmtM(ti);
  $('stat-total-address').textContent=DB_ADDRESS.length;
  // 动态计算续费状态
  for(var i=0;i<DB_ADDRESS.length;i++){var a=DB_ADDRESS[i];calcAddrActualRenewStatus(a)}
  var renewAddrs=DB_ADDRESS;
  if(curRole==='sales')renewAddrs=renewAddrs.filter(function(a){return a.sl===curUser.name});
  var totalRenew=renewAddrs.filter(function(a){return a.rd<=30&&a.ex!=='\u662f'}).length
    + renewAddrs.filter(function(a){return a.ex==='\u662f'}).length;
  $('stat-renew-count').textContent=totalRenew;$('renew-badge').textContent=totalRenew;$('renew-badge').style.display=totalRenew>0?'inline':'none';
  $('stat-total-customers').textContent=DB_CUSTOMERS.length;
  var tp_=0;for(var i=0;i<myOrders.length;i++){tp_+=(myOrders[i].profit_total||0)}$('stat-total-profit').textContent=fmtM(tp_);
  // 角色差异化：显示/隐藏统计卡片
  var allCards=document.querySelectorAll('.stat-card');
  for(var ci=0;ci<allCards.length;ci++)allCards[ci].style.display='';
  // 销售：隐藏"总利润"卡片（跟自己相关的太少）
  // 内勤：显示所有
  // 财务：显示所有
  // 业务员业绩排行：仅销管理/admin可见，销售和内勤隐藏
  var perfChart=$('performance-chart');
  if(perfChart)perfChart.parentElement.style.display=(isAdmin||isFinance)?'':'none';
  // 续费提醒：管理员、销售、内勤可见，财务隐藏
  var renewCard=document.querySelector('#renew-alert-list');
  if(renewCard)renewCard.parentElement.style.display=isFinance?'none':'';
  // 添加我的对接订单统计卡片（内勤专属）
  var neiqinCard=document.querySelector('#dashboard-neiqin-card');
  if(isNeiqin){
    // 统计内勤对接的订单
    var totalNq=0,completedNq=0,uncompletedNq=0;
    for(var oi=0;oi<DB_ORDERS.length;oi++){
      var o=DB_ORDERS[oi];
      if(o.nq!==curUser.name)continue;
      totalNq++;
      if(o.pg==='已办结')completedNq++;
      else uncompletedNq++;
    }
    if(!neiqinCard){
      var newCard=document.createElement('div');
      newCard.className='chart-card';
      newCard.id='dashboard-neiqin-card';
      newCard.innerHTML='<h3>我的对接订单</h3><div id="neiqin-order-stats" class="renew-list"></div>';
      var monthlyChart=document.querySelector('#monthly-summary');
      if(monthlyChart)monthlyChart.parentElement.parentElement.insertBefore(newCard,monthlyChart.parentElement);
    }
    $('neiqin-order-stats').innerHTML='<div style="padding:16px"><div style="display:flex;justify-content:space-around;text-align:center">'
      +'<div><div style="font-size:28px;font-weight:700;color:#3b82f6">'+totalNq+'</div><div style="font-size:12px;color:#6b7280;margin-top:4px">总对接</div></div>'
      +'<div><div style="font-size:28px;font-weight:700;color:#10b981">'+completedNq+'</div><div style="font-size:12px;color:#6b7280;margin-top:4px">已办结</div></div>'
      +'<div><div style="font-size:28px;font-weight:700;color:#f59e0b">'+uncompletedNq+'</div><div style="font-size:12px;color:#6b7280;margin-top:4px">未办结</div></div>'
      +'</div></div>';
  }else{
    if(neiqinCard)neiqinCard.style.display='none';
  }
  // 本月收支概览：内勤隐藏
  var monthlyChart=$('monthly-summary');
  if(monthlyChart)monthlyChart.parentElement.style.display=isNeiqin?'none':'';
  // 销售角色：修改统计卡片标签
  if(isSales){
    var orderLabel=document.querySelector('.stat-card.blue .stat-label');
    if(orderLabel)orderLabel.textContent='我的订单';
    var incomeLabel=document.querySelector('.stat-card.green .stat-label');
    if(incomeLabel)incomeLabel.textContent='我的收款';
  }
  // 快捷操作栏
  var qa=document.getElementById('quick-actions');
  if(qa){
    var qaBtns=[
      {icon:'➕',label:'新增客户',page:'customers',action:'openCustModal()'},
      {icon:'📋',label:'新建订单',page:'orders',action:"openOrderModal()"},
      {icon:'☁️',label:'申请开票',page:'invoice',action:"openApplyInvoiceModal()"},
      {icon:'✅',label:'审批中心',page:'approval',action:''},
      {icon:'🔔',label:'消息通知',page:'notifications',action:''},
      {icon:'📍',label:'地址管理',page:'address',action:''},
    ];
    var qaHtml='';
    for(var qi=0;qi<qaBtns.length;qi++){
      var b=qaBtns[qi];
      qaHtml+='<button class="btn-secondary" style="padding:6px 14px;font-size:12px;display:flex;align-items:center;gap:4px" onclick="'+ (b.action||'navigateTo(\''+b.page+'\')') +'">'+b.icon+' '+b.label+'</button>';
    }
    qa.innerHTML=qaHtml;
  }
  // 待办事项面板
  var todoPanel=document.getElementById('dashboard-todo');
  var todoList=document.getElementById('todo-list');
  if(todoPanel&&todoList){
    var todos=[];
    // 统计待审批数
    var pendCount=0;
    if(DB_INVOICES)pendCount+=DB_INVOICES.filter(function(x){return x.status==='pending'}).length;
    if(pendCount>0)todos.push('📄 有 <b>'+pendCount+'</b> 条开票申请待审批 → <a href="#" onclick="navigateTo(\'approval\');return false" style="color:#3b82f6">去处理</a>');
    // 待续费地址
    if(totalRenew>0)todos.push('⚠️ 有 <b>'+totalRenew+'</b> 个地址需要续费 → <a href="#" onclick="navigateTo(\'renew\');return false" style="color:#3b82f6">查看详情</a>');
    // 未读通知
    var unreadNotif=DB_NOTIFICATIONS.filter(function(n){return !n.read}).length;
    if(unreadNotif>0)todos.push('🔔 有 <b>'+unreadNotif+'</b> 条未读通知 → <a href="#" onclick="navigateTo(\'notifications\');return false" style="color:#3b82f6">查看</a>');
    // 待审批收款/支出
    if(todos.length>0){
      todoPanel.style.display='block';
      todoList.innerHTML='<ul style="margin:0;padding-left:20px">'+todos.map(function(t){return '<li style="margin-bottom:8px">'+t+'</li>'}).join('')+'</ul>';
    }else{
      todoPanel.style.display='none';
    }
  }
  renderPerfChart();renderRenewAlertList();renderOrderTypeChart();renderMonthlySummary();
  }catch(e){console.error('renderDashboard error:',e)}
}
function renderPerfChart(){
  var c=$('performance-chart');if(!c)return;var sm={};
  var myOrders=DB_ORDERS;
  if(curRole==='sales')myOrders=myOrders.filter(function(o){return o.sl===curUser.name});
  for(var i=0;i<myOrders.length;i++){var o=myOrders[i];sumOrder(o);if(!sm[o.sl])sm[o.sl]={n:o.sl,income:0,oc:0};sm[o.sl].income+=(o.pm_total||0);sm[o.sl].oc++}
  var arr=[];for(var k in sm)arr.push(sm[k]);arr.sort(function(a,b){return b.income-a.income});
  var mx=0;for(var i=0;i<arr.length;i++)if(arr[i].income>mx)mx=arr[i].income;mx=mx||1;
  var cl=['#f5222d','#fa8c16','#52c41a','#1890ff','#722ed1','#13c2c2'],html='';
  for(var j=0;j<arr.length;j++){var e=arr[j],pct=(e.income/mx*100).toFixed(0);html+='<div class="bar-item"><div class="bar-label">'+esc(e.n)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+cl[j%cl.length]+'"><span class="bar-value">'+fmtM(e.income)+'</span></div></div><span style="font-size:11px;color:#888;width:40px;text-align:right">'+e.oc+'\u5355</span></div>'}
  c.innerHTML=html||'<div class="empty-state"><div class="empty-icon">\ud83d\udcca</div><p>\u6682\u65e0\u4e1a\u7ee9\u6570\u636e</p></div>';
}
function renderRenewAlertList(){
  for(var i=0;i<DB_ADDRESS.length;i++){var a=DB_ADDRESS[i];calcAddrActualRenewStatus(a)}
  var myAddrs=DB_ADDRESS;
  if(curRole==='sales')myAddrs=myAddrs.filter(function(a){return a.sl===curUser.name});
  var c=$('renew-alert-list'),list=myAddrs.filter(function(a){return a.rs==='需要续费'&&a.ed}).sort(function(a,b){return a.rd-b.rd}).slice(0,8),html='';
  for(var i=0;i<list.length;i++){var a=list[i],cls=a.rd<0?'urgent':a.rd<=30?'warn':'ok',label=a.rd<0?'\u8d85'+Math.abs(a.rd)+'\u5929':a.rd+'\u5929';html+='<div class="renew-item"><div class="renew-days '+cls+'">'+label+'</div><div class="renew-name" title="'+esc(a.co)+'">'+(a.co||'(\u7a7a\u7f6e)')+'</div><div class="renew-sales">'+esc(a.sl)+'</div></div>'}
  c.innerHTML=html||'<div class="empty-state"><p>\u2705 \u6682\u65e0\u5f85\u7eed\u8d39\u63d0\u9192</p></div>';
}
function renderOrderTypeChart(){
  var c=$('order-type-chart'),tp={};
  var myOrders=DB_ORDERS;
  if(curRole==='sales')myOrders=myOrders.filter(function(o){return o.sl===curUser.name});
  for(var i=0;i<myOrders.length;i++){var o=myOrders[i];sumOrder(o);tp[o.bt]=(tp[o.bt]||0)+(o.pm_total||0)}
  var ks=[],total=0;for(var k in tp){ks.push(k);total+=tp[k]}total=total||1;
  var cl={'\u5730\u5740\u9500\u552e':'#1890ff','\u5730\u5740\u7eed\u8d39':'#52c41a'},start=0,html='<div style="width:120px;height:120px;border-radius:50%;background:conic-gradient(';
  for(var i=0;i<ks.length;i++){var deg=((tp[ks[i]]/total)*360).toFixed(1);html+=(cl[ks[i]]||'#999')+' '+start+'deg '+(+start+ +deg)+'deg,';start+= +deg}
  html=html.slice(0,-1)+')"></div><div class="pie-legend">';
  for(var j=0;j<ks.length;j++)html+='<div class="pie-legend-item"><span class="pie-dot" style="background:'+(cl[ks[j]]||'#999')+'"></span>'+ks[j]+': '+fmtM(tp[ks[j]])+' ('+(tp[ks[j]]/total*100).toFixed(1)+'%)</div>';
  html+='</div>';c.innerHTML=html||'<div class="empty-state">\u6682\u65e0\u8ba2\u5355</div>';
}
function renderMonthlySummary(){
  var c=$('monthly-summary'),now=new Date(),y=now.getFullYear(),m=now.getMonth()+1;
  var myOrders=DB_ORDERS;
  if(curRole==='sales')myOrders=myOrders.filter(function(o){return o.sl===curUser.name});
  var mo=myOrders.filter(function(o){if(!o.od)return false;var d=o.od.split('-');return +d[0]===y&&+d[1]===m});
  for(var i=0;i<mo.length;i++)sumOrder(mo[i]);
  var inc=mo.reduce(function(s,o){return s+(o.pm_total||0)},0),cost=mo.reduce(function(s,o){return s+(o.cost_total||0)},0),profit=mo.reduce(function(s,o){return s+(o.profit_total||0)},0);
  c.innerHTML='<div class="summary-row"><span class="summary-label">\u672c\u6708\u6536\u6b3e</span><span class="summary-value green">'+fmtM(inc)+'</span></div><div class="summary-row"><span class="summary-label">\u672c\u6708\u6210\u672c</span><span class="summary-value red">'+fmtM(cost)+'</span></div><div class="summary-row"><span class="summary-label">\u672c\u6708\u5229\u6da6</span><span class="summary-value blue">'+fmtM(profit)+'</span></div><div class="summary-row"><span class="summary-label">\u672c\u6708\u8ba2\u5355\u6570</span><span class="summary-value">'+mo.length+' \u5355</span></div>';
  // 近6月收支趋势图（已移除）
}
// ========== 通知消息系统 ==========
function addNotification(msg, type, relatedType, relatedId, targetUser){
  if(!msg)return;
  var notif = {msg:msg,type:type||'info',ts:todayStr()+' '+new Date().toTimeString().substr(0,5),read:false};
  if(relatedType) notif.relatedType = relatedType;
  if(relatedId) notif.relatedId = relatedId;
  if(targetUser) notif.targetUser = targetUser;
  DB_NOTIFICATIONS.unshift(notif);
  if(DB_NOTIFICATIONS.length>100)DB_NOTIFICATIONS.length=100;
  updateNotifBadge();
  try{localStorage.setItem('crm_notifications',JSON.stringify(DB_NOTIFICATIONS));}catch(e){}
  // 同步到服务器
  pushNotificationsToServer();
}
function pushNotificationsToServer(){
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  if(!_token)return;
  var apiBase='';
  var hdrs={'Content-Type':'application/json','Authorization':'Bearer '+_token};
  fetch(apiBase+'/api/notifications',{method:'POST',headers:hdrs,body:JSON.stringify(DB_NOTIFICATIONS[0])}).catch(function(){});
}
function updateNotifBadge(){
  var unread=DB_NOTIFICATIONS.filter(function(n){return !n.read}).length;
  var badge=document.getElementById('notif-badge');
  if(badge){badge.textContent=unread;badge.style.display=unread>0?'inline-block':'none';}
  var sbBadge=document.getElementById('notif-sidebar-badge');
  if(sbBadge){sbBadge.textContent=unread;sbBadge.style.display=unread>0?'inline':'none';}
}
function toggleNotifDropdown(){
  var dd=document.getElementById('notif-dropdown');
  if(!dd)return;
  if(dd.style.display==='block'){dd.style.display='none';return;}
  // 渲染通知列表
  var html='<div style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;font-size:13px;display:flex;justify-content:space-between">'
    +'<span>\u901a\u77e5</span>'
    +'<span style="font-weight:400;font-size:11px;color:#3b82f6;cursor:pointer" onclick="clearAllNotifications()">\u5168\u90e8\u5df2\u8bfb</span></div>';
  if(DB_NOTIFICATIONS.length===0){
    html+='<div style="padding:30px;text-align:center;color:#999;font-size:12px">\u6682\u65e0\u901a\u77e5</div>';
  }else{
    for(var i=0;i<DB_NOTIFICATIONS.length;i++){
      var n=DB_NOTIFICATIONS[i];
      html+='<div style="padding:8px 12px;border-bottom:1px solid #f3f4f6;'+(n.read?'':'background:#eff6ff')+';cursor:pointer" onclick="markNotifRead('+i+')">'
        +'<div style="font-size:13px;color:#333">'+(n.read?'':'<span style="color:#3b82f6;margin-right:4px">\u25cf</span>')+esc(n.msg)+'</div>'
        +'<div style="font-size:11px;color:#9ca3af;margin-top:2px">'+esc(n.ts)+'</div>'
        +'</div>';
    }
  }
  dd.innerHTML=html;
  dd.style.display='block';
  // 点击外部关闭
  setTimeout(function(){
    document.addEventListener('click', closeNotifDropdownHandler);
  },10);
}
function closeNotifDropdown(){
  var dd=document.getElementById('notif-dropdown');
  if(dd)dd.style.display='none';
  document.removeEventListener('click', closeNotifDropdownHandler);
}
function closeNotifDropdownHandler(e){
  var bell=document.getElementById('notif-bell');
  var dd=document.getElementById('notif-dropdown');
  if(bell&&bell.contains(e.target))return;
  if(dd&&dd.contains(e.target))return;
  closeNotifDropdown();
}
function markNotifRead(idx){
  if(DB_NOTIFICATIONS[idx]){DB_NOTIFICATIONS[idx].read=true;updateNotifBadge();}
  toggleNotifDropdown();
}
// 全局搜索
function onGlobalSearch(q){
  if(!q||q.trim().length<1){closeGlobalSearch();return}
  q=q.trim().toLowerCase();
  var dd=document.getElementById('search-results-dropdown');
  if(!dd)return;
  var groups=[];
  // 搜索客户
  var custMatches=[];
  if(DB_CUSTOMERS){
    for(var i=0;i<DB_CUSTOMERS.length;i++){
      var c=DB_CUSTOMERS[i];
      var haystack=((c.nn||'')+' '+(c.co||'')+' '+(c.wx||'')+' '+(c.phone||'')+' '+(c.sl||'')).toLowerCase();
      if(haystack.indexOf(q)!==-1){
        custMatches.push({id:c.id,label:c.nn||c.co,detail:c.co,icon:'👥'});
        if(custMatches.length>=5)break;
      }
    }
  }
  if(custMatches.length>0)groups.push({title:'客户',items:custMatches,page:'customers'});
  
  // 搜索订单
  var ordMatches=[];
  if(DB_ORDERS){
    for(var i=0;i<DB_ORDERS.length;i++){
      var o=DB_ORDERS[i];
      var haystack=((o.bn||'')+' '+(o.nn||'')+' '+(o.sl||'')).toLowerCase();
      if(haystack.indexOf(q)!==-1){
        ordMatches.push({id:o.id,label:o.bn||'#'+o.id,detail:o.nn||'',icon:'📋'});
        if(ordMatches.length>=5)break;
      }
    }
  }
  if(ordMatches.length>0)groups.push({title:'订单',items:ordMatches,page:'orders'});
  
  // 搜索地址
  var addrMatches=[];
  if(DB_ADDRESS){
    for(var i=0;i<DB_ADDRESS.length;i++){
      var a=DB_ADDRESS[i];
      var haystack=((a.ad||'')+' '+(a.co||'')+' '+(a.bn||'')+' '+(a.rm||'')+' '+(a.lp||'')).toLowerCase();
      if(haystack.indexOf(q)!==-1){
        addrMatches.push({id:a.id,label:a.co||a.ad,detail:(a.bn||'')+' '+(a.rm||''),icon:'📍'});
        if(addrMatches.length>=5)break;
      }
    }
  }
  if(addrMatches.length>0)groups.push({title:'地址',items:addrMatches,page:'address'});
  
  // 搜索发票
  if(DB_INVOICES){
    var invMatches=[];
    for(var i=0;i<DB_INVOICES.length;i++){
      var r=DB_INVOICES[i];
      var haystack=((r.bn||'')+' '+(r.title||'')+' '+(r.nick||'')+' '+(r.salesperson||'')).toLowerCase();
      if(haystack.indexOf(q)!==-1){
        invMatches.push({id:r.id,label:r.bn||'#'+r.id,detail:r.title||r.nick||'',icon:'📄'});
        if(invMatches.length>=5)break;
      }
    }
    if(invMatches.length>0)groups.push({title:'开票',items:invMatches,page:'invoice'});
  }
  
  renderGlobalSearchResults(groups, dd);
  dd.style.display='block';
}
function onGlobalSearchInput(q){
  if(!q||q.trim().length<2){closeGlobalSearch();return}
  onGlobalSearch(q);
}
function closeGlobalSearch(){
  var dd=document.getElementById('search-results-dropdown');
  if(dd)dd.style.display='none';
}
function renderGlobalSearchResults(groups, dd){
  if(!dd)return;
  if(groups.length===0){
    dd.innerHTML='<div class="sr-empty">未找到匹配结果</div>';
    return;
  }
  var html='';
  for(var g=0;g<groups.length;g++){
    var grp=groups[g];
    html+='<div class="sr-group">'
      +'<div class="sr-group-header">'+grp.title+' ('+grp.items.length+')</div>';
    for(var i=0;i<grp.items.length;i++){
      var item=grp.items[i];
      html+='<div class="sr-item" onclick="navigateTo(\''+grp.page+'\');closeGlobalSearch()">'
        +'<span class="sr-icon">'+item.icon+'</span>'
        +'<span class="sr-text">'+esc(item.label)+'</span>'
        +'<span class="sr-detail">'+esc(item.detail)+'</span>'
        +'</div>';
    }
    html+='</div>';
  }
  dd.innerHTML=html;
}
function clearAllNotifications(){
  for(var i=0;i<DB_NOTIFICATIONS.length;i++)DB_NOTIFICATIONS[i].read=true;
  updateNotifBadge();
  toggleNotifDropdown();
}
// 全屏通知页面渲染
function renderNotificationsPage(){
  var container=document.getElementById('notifications-list');
  if(!container)return;
  updateNotifBadge();
  var html='';
  if(DB_NOTIFICATIONS.length===0){
    html='<div style="padding:60px;text-align:center;color:#999;font-size:14px">暂无通知</div>';
  }else{
    for(var i=0;i<DB_NOTIFICATIONS.length;i++){
      var n=DB_NOTIFICATIONS[i];
      var bg=n.read?'#fff':'#eff6ff';
      var badge=n.read?'':'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;margin-right:8px;flex-shrink:0"></span>';
      var typeIcon='📌';
      if(n.type==='success')typeIcon='✅';
      else if(n.type==='error')typeIcon='❌';
      else if(n.type==='warning')typeIcon='⚠️';
      else if(n.type==='info')typeIcon='💬';
      html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:14px 16px;background:'+bg+';border-bottom:1px solid #f3f4f6;cursor:pointer;border-radius:8px;margin-bottom:4px;transition:background .15s" onclick="markNotifReadFromPage('+i+')" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\''+bg+'\'">'
        +'<div style="font-size:18px;flex-shrink:0;margin-top:1px">'+typeIcon+'</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        +badge
        +'<span style="font-size:13px;color:#333;word-break:break-word">'+esc(n.msg)+'</span>'
        +'</div>'
        +'<div style="font-size:11px;color:#9ca3af">'+esc(n.ts)+'</div>'
        +'</div>'
        +'<div style="font-size:11px;color:#3b82f6;flex-shrink:0">'+(n.read?'':'<b>未读</b>')+'</div>'
        +'</div>';
    }
  }
  container.innerHTML=html;
}
function markNotifReadFromPage(idx){
  if(DB_NOTIFICATIONS[idx]&&!DB_NOTIFICATIONS[idx].read){
    DB_NOTIFICATIONS[idx].read=true;
    updateNotifBadge();
    renderNotificationsPage();
  }
}
// ========== 合同管理 ==========
var DB_CONTRACTS=[];
function renderContractsPage(){
  var container=document.getElementById('contracts-list');
  if(!container)return;
  // 从DB_ORDERS中收集已确认收款/已通过的订单作为可生成合同的数据源
  var readyOrders=[];
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var hasPay=false;
      // 检查 pr_records (新格式)
      var payRecs=it.pr_records||[];
      for(var k=0;k<payRecs.length;k++){if(payRecs[k].pf&&!payRecs[k].prej){hasPay=true;break;}}
      // 检查 pr (旧格式,可能是数组)
      if(!hasPay){var prArr=it.pr||[];if(!Array.isArray(prArr))prArr=[];for(var k=0;k<prArr.length;k++){if(prArr[k].pf&&!prArr[k].prej){hasPay=true;break;}}}
      // 检查传统 pm/pd 字段 (种子数据格式)
      if(!hasPay&&it.pm&&it.pm>0&&it.pd)hasPay=true;
      // 检查母订单级别的收款
      if(!hasPay&&o.pr&&Array.isArray(o.pr)){for(var k=0;k<o.pr.length;k++){if(o.pr[k].pf&&!o.pr[k].prej){hasPay=true;break;}}}
      if(hasPay&&it.co)readyOrders.push({o:o,it:it,idx:j});
    }
  }
  // 已生成的合同列表（从localStorage读取）
  var saved=[];try{saved=JSON.parse(localStorage.getItem('crm_contracts')||'[]');}catch(e){}
  DB_CONTRACTS=saved;
  var html='';
  // 合同列表
  if(saved.length===0){
    html='<div style="text-align:center;padding:60px 20px;color:#9ca3af"><div style="font-size:48px;margin-bottom:12px">📝</div><p style="font-size:14px">暂无合同</p><p style="font-size:12px;margin-top:8px">选择已收款的订单生成合同</p></div>';
  }else{
    html='<div class="stats-grid" style="margin-bottom:16px">'
      +'<div class="stat-card blue"><div class="stat-icon">📝</div><div class="stat-info"><div class="stat-value">'+saved.length+'</div><div class="stat-label">合同总数</div></div></div>'
      +'<div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-info"><div class="stat-value">'+saved.filter(function(c){return c.status==='active'}).length+'</div><div class="stat-label">有效合同</div></div></div>'
      +'</div>';
    for(var i=saved.length-1;i>=0;i--){
      var c=saved[i];
      var statusTag=c.status==='active'?'<span class="tag-green">有效</span>':'<span class="tag-gray">已归档</span>';
      html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px">'
        +'<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:14px;color:#333">'+esc(c.title||'合同 #'+c.id)+'</div>'
        +'<div style="font-size:12px;color:#6b7280;margin-top:4px">'+esc(c.co||'')+' · '+esc(c.bn||'')+' · '+esc(c.date||'')+'</div></div>'
        +'<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">'
        +statusTag
        +'<button class="btn-view" onclick="previewContract('+i+')" style="padding:4px 10px;font-size:11px">预览</button>'
        +'<button class="btn-primary" onclick="downloadContractWord('+i+')" style="padding:4px 10px;font-size:11px">📥 下载Word</button>'
        +'<button class="btn-primary" onclick="printContract('+i+')" style="padding:4px 10px;font-size:11px">🖨️ 打印</button>'
        +'<button class="btn-danger" onclick="deleteContract('+i+')" style="padding:4px 10px;font-size:11px">删除</button>'
        +'</div></div>';
    }
  }
  // 可生成合同的订单
  if(readyOrders.length>0){
    html+='<div style="margin-top:24px"><h3 style="font-size:14px;color:#374151;margin-bottom:12px">📋 可生成合同的订单</h3></div>';
    for(var i=0;i<readyOrders.length;i++){
      var ro=readyOrders[i];
      html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px">'
        +'<div style="flex:1;min-width:0"><span style="font-weight:600;font-size:13px">'+esc(ro.o.bn)+'</span>'
        +'<span style="color:#6b7280;font-size:12px;margin-left:8px">'+esc(ro.it.co)+'</span>'
        +'<span style="color:#9ca3af;font-size:11px;margin-left:8px">'+esc(ro.it.subBn||'')+'</span></div>'
        +'<button class="btn-primary" onclick="generateContract('+ro.o.id+','+ro.idx+')" style="padding:4px 12px;font-size:11px">生成合同</button>'
        +'</div>';
    }
  }
  container.innerHTML=html;
}
function generateContract(oid, idx){
  var o=null;
  for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].id===oid){o=DB_ORDERS[i];break}}
  if(!o||!o.items||!o.items[idx]){toast('订单数据异常','error');return;}
  var it=o.items[idx];
  var now=new Date();
  var dateStr=now.getFullYear()+'年'+(now.getMonth()+1)+'月'+now.getDate()+'日';
  var contract={
    id:Date.now(),
    oid:oid,
    itemIdx:idx,
    bn:o.bn,
    co:it.co,
    subBn:it.subBn,
    title:'地址挂靠服务合同 - '+it.co,
    date:dateStr,
    status:'active',
    content:{
      partyA:it.co||'________',
      partyB:'杭州某某企业管理有限公司',
      addr:it.addr||it.ad||'________',
      price:it.pr||0,
      period:(it.st||'________')+' 至 '+(it.ed||'________'),
      sales:o.sl||'',
      bn:o.bn||'',
      subBn:it.subBn||''
    }
  };
  var saved=[];try{saved=JSON.parse(localStorage.getItem('crm_contracts')||'[]');}catch(e){}
  saved.push(contract);
  try{localStorage.setItem('crm_contracts',JSON.stringify(saved));}catch(e){}
  DB_CONTRACTS=saved;
  toast('合同已生成');
  renderContractsPage();
}
function generateContractFromOrder(){
  // 弹窗显示可生成合同的订单供选择
  var readyOrders=[];
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var hasPay=false;
      var payRecs=it.pr_records||[];
      for(var k=0;k<payRecs.length;k++){if(payRecs[k].pf&&!payRecs[k].prej){hasPay=true;break;}}
      if(!hasPay){var prArr=it.pr||[];if(!Array.isArray(prArr))prArr=[];for(var k=0;k<prArr.length;k++){if(prArr[k].pf&&!prArr[k].prej){hasPay=true;break;}}}
      if(!hasPay&&it.pm&&it.pm>0&&it.pd)hasPay=true;
      if(!hasPay&&o.pr&&Array.isArray(o.pr)){for(var k=0;k<o.pr.length;k++){if(o.pr[k].pf&&!o.pr[k].prej){hasPay=true;break;}}}
      if(hasPay&&it.co)readyOrders.push({o:o,it:it,idx:j});
    }
  }
  if(readyOrders.length===0){toast('暂无已收款的订单可生成合同','info');return;}
  var listHtml='';
  for(var i=0;i<readyOrders.length;i++){
    var ro=readyOrders[i];
    listHtml+='<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px">'
      +'<div><div style="font-weight:600;font-size:13px">'+esc(ro.o.bn)+'</div><div style="font-size:12px;color:#6b7280;margin-top:2px">'+esc(ro.it.co)+' · '+esc(ro.it.subBn||'')+'</div></div>'
      +'<button class="btn-primary" onclick="closeModal();generateContract('+ro.o.id+','+ro.idx+');setTimeout(renderContractsPage,300)" style="padding:4px 12px;font-size:11px">生成合同</button></div>';
  }
  showModal('选择订单生成合同',listHtml,null,null,'500px');
}
function previewContract(idx){
  var saved=[];try{saved=JSON.parse(localStorage.getItem('crm_contracts')||'[]');}catch(e){}
  var c=saved[idx];
  if(!c){toast('合同不存在','error');return;}
  var ct=c.content||{};
  showModal(c.title,
    '<div id="contract-preview" style="max-width:700px;margin:0 auto;padding:20px;font-family:serif;line-height:1.8">'
    +'<div style="text-align:center;margin-bottom:24px"><h2 style="font-size:18px;font-weight:700;margin:0">地址挂靠服务合同</h2><p style="font-size:12px;color:#666;margin-top:4px">合同编号：'+esc(ct.bn||'')+'-'+esc(ct.subBn||'')+'</p></div>'
    +'<div style="font-size:13px">'
    +'<p>甲方（委托方）：<b>'+esc(ct.partyA)+'</b></p>'
    +'<p>乙方（服务方）：<b>'+esc(ct.partyB)+'</b></p>'
    +'<hr style="border:none;border-top:1px solid #ddd;margin:16px 0">'
    +'<p>经甲乙双方友好协商，就地址挂靠服务达成如下协议：</p>'
    +'<p><b>一、服务内容</b></p>'
    +'<p>乙方为甲方提供工商注册地址挂靠服务，地址为：<b>'+esc(ct.addr)+'</b></p>'
    +'<p><b>二、服务期限</b></p>'
    +'<p>服务期限为：<b>'+esc(ct.period)+'</b></p>'
    +'<p><b>三、服务费用</b></p>'
    +'<p>服务费为：<b>¥'+fmtM(ct.price)+'</b></p>'
    +'<p><b>四、其他</b></p>'
    +'<p>本协议一式两份，甲乙双方各执一份，具有同等法律效力。</p>'
    +'<hr style="border:none;border-top:1px solid #ddd;margin:16px 0">'
    +'<div style="display:flex;justify-content:space-between;margin-top:24px">'
    +'<div>甲方（签章）：<br><br><span style="font-size:11px;color:#999">'+esc(ct.partyA)+'</span></div>'
    +'<div>乙方（签章）：<br><br><span style="font-size:11px;color:#999">'+esc(ct.partyB)+'</span></div>'
    +'</div>'
    +'<div style="text-align:center;margin-top:24px;font-size:11px;color:#999">签订日期：'+esc(c.date)+'</div>'
    +'</div></div>'
    +'<div style="margin-top:16px;text-align:center"><button class="btn-primary" onclick="printContract('+idx+')" style="padding:8px 24px">🖨️ 打印 / 导出PDF</button></div>',
    null,null,'800px');
}
function printContract(idx){
  previewContract(idx);
  setTimeout(function(){
    window.print();
  },500);
}
// 删除合同
function deleteContract(idx){
  if(!confirm('确定要删除这份合同吗？此操作不可撤销。'))return;
  var saved=[];try{saved=JSON.parse(localStorage.getItem('crm_contracts')||'[]');}catch(e){}
  if(!saved[idx]){toast('合同不存在','error');return;}
  saved.splice(idx,1);
  try{localStorage.setItem('crm_contracts',JSON.stringify(saved));}catch(e){}
  DB_CONTRACTS=saved;
  toast('合同已删除');
  renderContractsPage();
}
// 下载合同为 Word（HTML格式，Word可打开）
function downloadContractWord(idx){
  var saved=[];try{saved=JSON.parse(localStorage.getItem('crm_contracts')||'[]');}catch(e){}
  var c=saved[idx];
  if(!c){toast('合同不存在','error');return;}
  var ct=c.content||{};
  var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    +'<head><meta charset="utf-8"><title>'+esc(c.title)+'</title>'
    +'<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->'
    +'<style>body{font-family:SimSun,serif;font-size:12pt;padding:40px;line-height:2}.title{text-align:center;font-size:18pt;font-weight:bold;margin-bottom:20pt}.sub{text-align:center;font-size:10pt;color:#666;margin-bottom:30pt}.clause{margin-bottom:8pt}.sig{display:flex;justify-content:space-between;margin-top:40pt}.footer{text-align:center;font-size:10pt;color:#999;margin-top:40pt}</style></head>'
    +'<body>'
    +'<div class="title">地址挂靠服务合同</div>'
    +'<div class="sub">合同编号：'+esc(ct.bn||'')+'-'+esc(ct.subBn||'')+'</div>'
    +'<div class="clause">甲方（委托方）：<b>'+esc(ct.partyA)+'</b></div>'
    +'<div class="clause">乙方（服务方）：<b>'+esc(ct.partyB)+'</b></div>'
    +'<hr style="border-top:1px solid #ccc">'
    +'<div class="clause">经甲乙双方友好协商，就地址挂靠服务达成如下协议：</div>'
    +'<div class="clause"><b>一、服务内容</b></div>'
    +'<div class="clause">乙方为甲方提供工商注册地址挂靠服务，地址为：<b>'+esc(ct.addr)+'</b></div>'
    +'<div class="clause"><b>二、服务期限</b></div>'
    +'<div class="clause">服务期限为：<b>'+esc(ct.period)+'</b></div>'
    +'<div class="clause"><b>三、服务费用</b></div>'
    +'<div class="clause">服务费为：<b>¥'+fmtM(ct.price)+'</b></div>'
    +'<div class="clause"><b>四、其他</b></div>'
    +'<div class="clause">本协议一式两份，甲乙双方各执一份，具有同等法律效力。</div>'
    +'<hr style="border-top:1px solid #ccc">'
    +'<div class="sig">'
    +'<div>甲方（签章）：<br><br><span style="font-size:10pt;color:#999">'+esc(ct.partyA)+'</span></div>'
    +'<div>乙方（签章）：<br><br><span style="font-size:10pt;color:#999">'+esc(ct.partyB)+'</span></div>'
    +'</div>'
    +'<div class="footer">签订日期：'+esc(c.date)+'</div>'
    +'</body></html>';
  var blob=new Blob(['\ufeff'+html],{type:'application/msword'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download=(c.title||'合同')+'.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// 近6月收支趋势SVG柱状图
function renderMonthlyTrend(){
  var container=document.getElementById('monthly-trend');
  if(!container)return;
  var now=new Date(),months=[];
  for(var mi=5;mi>=0;mi--){
    var d=new Date(now.getFullYear(),now.getMonth()-mi,1);
    var ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    months.push(ym);
  }
  var maxV=0,data=[];
  for(var mi=0;mi<months.length;mi++){
    var ym=months[mi].split('-'),y=+ym[0],m=+ym[1];
    var filterOrders=DB_ORDERS.filter(function(o){if(!o.od)return false;var d=o.od.split('-');return +d[0]===y&&+d[1]===m});
    for(var fi=0;fi<filterOrders.length;fi++)sumOrder(filterOrders[fi]);
    var inc=filterOrders.reduce(function(s,o){return s+(o.pm_total||0)},0);
    var exp=filterOrders.reduce(function(s,o){return s+((o.exp_total||0)+(o.cost_total||0))},0);
    if(inc>maxV)maxV=inc;if(exp>maxV)maxV=exp;
    data.push({ym:months[mi],label:ym.slice(2),inc:inc,exp:exp});
  }
  if(maxV===0)maxV=1;
  var w=Math.max(container.clientWidth-2,400),h=240,pl=55,pr=16,pt=24,pb=36;
  var chartW=w-pl-pr,chartH=h-pt-pb;
  var ticks=[{pct:0,label:'0'},{pct:25,label:fmtM(Math.round(maxV*0.25))},{pct:50,label:fmtM(Math.round(maxV*0.5))},{pct:75,label:fmtM(Math.round(maxV*0.75))},{pct:100,label:fmtM(maxV)}];
  var barW=Math.floor((chartW-24)/months.length/2)-4;
  if(barW<6)barW=6;
  var gap=Math.floor((chartW-barW*2*months.length)/(months.length+1));
  var svg='<svg width="100%" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif">'
    +'<defs><linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#059669"/><stop offset="100%" stop-color="#34d399"/></linearGradient>'
    +'<linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d97706"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs>'
    +'<rect width="'+w+'" height="'+h+'" fill="#fff" rx="8"/>';
  for(var ti=0;ti<ticks.length;ti++){
    var t=ticks[ti],y=pt+chartH-(t.pct/100*chartH);
    svg+='<line x1="'+pl+'" y1="'+y+'" x2="'+(w-pr)+'" y2="'+y+'" stroke="#f0f0f0" stroke-width="1"/>';
    svg+='<text x="'+(pl-6)+'" y="'+(y+3)+'" fill="#9ca3af" font-size="10" text-anchor="end">'+t.label+'</text>';
  }
  svg+='<line x1="'+pl+'" y1="'+(h-pb)+'" x2="'+(w-pr)+'" y2="'+(h-pb)+'" stroke="#e5e7eb" stroke-width="1"/>';
  for(var mi=0;mi<data.length;mi++){
    var d=data[mi],x=pl+gap+mi*(barW*2+gap+gap);
    var ih=Math.max(2,(d.inc/maxV)*chartH);
    var eh=Math.max(2,(d.exp/maxV)*chartH);
    svg+='<rect x="'+x+'" y="'+(pt+chartH-ih)+'" width="'+barW+'" height="'+ih+'" fill="url(#incGrad)" rx="3" opacity="0.85">'
      +'<title>收款: '+fmtM(d.inc)+'</title></rect>';
    svg+='<rect x="'+(x+barW+gap)+'" y="'+(pt+chartH-eh)+'" width="'+barW+'" height="'+eh+'" fill="url(#expGrad)" rx="3" opacity="0.85">'
      +'<title>支出: '+fmtM(d.exp)+'</title></rect>';
    if(ih>18)svg+='<text x="'+(x+barW/2)+'" y="'+(pt+chartH-ih-5)+'" fill="#059669" font-size="9" text-anchor="middle" font-weight="600">'+fmtM(d.inc)+'</text>';
    if(eh>18)svg+='<text x="'+(x+barW*1.5+gap)+'" y="'+(pt+chartH-eh-5)+'" fill="#d97706" font-size="9" text-anchor="middle" font-weight="600">'+fmtM(d.exp)+'</text>';
    svg+='<text x="'+(x+barW+gap/2)+'" y="'+(h-8)+'" fill="#6b7280" font-size="10" text-anchor="middle">'+d.label+'</text>';
  }
  svg+='<rect x="'+(pl-2)+'" y="6" width="10" height="10" fill="#059669" rx="2"/><text x="'+(pl+12)+'" y="14" fill="#374151" font-size="11">收款</text>'
    +'<rect x="'+(pl+50)+'" y="6" width="10" height="10" fill="#d97706" rx="2"/><text x="'+(pl+64)+'" y="14" fill="#374151" font-size="11">支出</text>'
    +'<text x="'+(w-pr)+'" y="14" fill="#9ca3af" font-size="10" text-anchor="end">近6月趋势</text>';
  svg+='</svg>';
  container.innerHTML=svg;
}

// ---- 表格列头筛选面板（WPS风格） ----
var _addrFilterDefs={
  t:'类型',ad:'地址',rm:'房间号',status:'状态',bn:'业务编号',co:'单位名称',
  sl:'业务员',nn:'客户昵称',sd:'开始时间',ed:'结束时间',rs:'续费状态',
  pm:'收款金额',pd:'收款时间',lp:'法人',ph:'联系电话',pa:'收款账号',ex:'是否异常'
};
var _addrFilters={},_fpCol=null,_fpTh=null;
var _addrSelected={}; // 批量选择 {id: true}
function toggleAddrSelect(id, checked){
  if(checked)_addrSelected[id]=true;else delete _addrSelected[id];
  updateAddrBatchBar();
}
function toggleAllAddr(checked){
  _addrSelected={};
  if(checked){
    var data=getAddrFilteredData();
    for(var i=0;i<data.length;i++)_addrSelected[data[i].id]=true;
  }
  updateAddrBatchBar();
  renderAddressTable();
}
function updateAddrBatchBar(){
  var count=Object.keys(_addrSelected).length;
  var bar=document.getElementById('addr-batch-bar');
  var cnt=document.getElementById('addr-batch-count');
  if(bar)bar.classList.toggle('show',count>0);
  if(cnt)cnt.textContent=count;
}
function clearAddrSelection(){_addrSelected={};updateAddrBatchBar();renderAddressTable();}
function batchDeleteAddr(){
  var ids=Object.keys(_addrSelected);
  if(ids.length===0){toast('请先选择要删除的地址','error');return;}
  confirmDialog('确定删除选中的 '+ids.length+' 个地址？此操作不可恢复！',function(){
    for(var i=0;i<ids.length;i++){
      DB_ADDRESS=DB_ADDRESS.filter(function(a){return a.id!=ids[i]});
    }
    _addrSelected={};
    syncAll();
    toast('已删除 '+ids.length+' 个地址');
    updateAddrBatchBar();
    renderAddressTable();
  });
}
function batchExportAddr(){
  var ids=Object.keys(_addrSelected);
  if(ids.length===0){toast('请先选择要导出的地址','error');return;}
  var selected=DB_ADDRESS.filter(function(a){return ids.indexOf(String(a.id))!==-1});
  var headers=['类型','地址','房间号','状态','业务编号','单位名称','业务员','客户昵称','开始时间','结束时间','续费状态','收款金额','收款账号','收款时间','法人','联系电话'];
  var rows=selected.map(function(a){
    return [a.t||'',a.ad||'',a.rm||'',a.bn?'已占用':'空置',a.bn||'',a.co||'',a.sl||'',a.nn||'',a.sd||'',a.ed||'',a.rs||'',a.pm||0,a.pa||'',a.pd||'',a.lp||'',a.ph||''];
  });
  downloadExcel(headers,rows,'选中地址_'+ids.length+'条');
  clearAddrSelection();
}
var _addrSort={col:'rm',dir:'asc'}; // 默认排序：房间号升序
// 初始化筛选状态
(function(){
  var ks=Object.keys(_addrFilterDefs);
  for(var i=0;i<ks.length;i++){var k=ks[i];_addrFilters[k]={enabled:false,vals:{},search:''}
  }
})();
function openFilterPopup(col,thEl){
  if(_fpCol===col){closeFilterPopup();return}
  closeFilterPopup();
  _fpCol=col;_fpTh=thEl;
  renderFilterPopup(col);
  var pop=$('filter-popup');
  pop.style.display='block';
  // 定位在th下方
  var rect=thEl.getBoundingClientRect();
  pop.style.left=Math.max(5,rect.left)+'px';
  pop.style.top=(rect.bottom+2)+'px';
  // 聚焦搜索框
  setTimeout(function(){var inp=pop.querySelector('.fp-search input');if(inp)inp.focus()},50);
}
function closeFilterPopup(){
  var pop=$('filter-popup');
  if(pop)pop.style.display='none';
  _fpCol=null;_fpTh=null;
}
function renderFilterPopup(col){
  var pop=$('filter-popup');if(!pop)return;
  var defs=_addrFilterDefs;
  // 收集当前筛选后数据（排除当前列）
  var curFil=getAddrFilteredData(col);
  // 收集该列所有唯一值及数量
  var vals={},total=0,hasBlank=false;
  for(var i=0;i<curFil.length;i++){
    var v=curFil[i][col];
    if(v==null||v===''){hasBlank=true;total++}
    else{vals[v]=(vals[v]||0)+1;total++}
  }
  // 构建面板HTML
  var h='<div class="fp-search"><input placeholder="搜索值..." oninput="renderFilterPopup(\''+col+'\')" value="'+esc(_addrFilters[col].search)+'"></div>';
  h+='<div class="fp-actions">';
  h+='<label><input type="checkbox" onchange="filterPopupToggleAll(\''+col+'\')" id="fp-chk-all"> 全选</label>';
  h+='<button onclick="filterPopupInvert(\''+col+'\')">反选</button>';
  h+='<button onclick="filterDups(\''+col+'\')">重复项</button>';
  h+='<button onclick="filterUnique(\''+col+'\')">唯一项</button>';
  h+='</div>';
  h+='<div class="fp-list">';
  var search=_addrFilters[col].search||'';
  var keys=Object.keys(vals).sort();
  var anyChecked=false,allChecked=true;
  if(hasBlank){
    var ck=_addrFilters[col].vals['(空)']?'checked':'';
    if(ck)anyChecked=true;else allChecked=false;
    var show=!search||'(空)'.indexOf(search)!==-1;
    if(show)h+='<label><input type="checkbox" value="(空)" '+ck+' onchange="onFPCheck(this,\''+col+'\')"> (空) <span class="fp-count">'+(hasBlank?total-(keys.length?keys.reduce(function(s,k){return s+vals[k]},0):0):0)+'</span></label>';
  }
  for(var ki=0;ki<keys.length;ki++){
    var v=keys[ki],cnt=vals[v];
    if(search&&v.toLowerCase().indexOf(search.toLowerCase())===-1)continue;
    var ck=_addrFilters[col].vals[v]?'checked':'';
    if(ck)anyChecked=true;else allChecked=false;
    h+='<label><input type="checkbox" value="'+esc(v)+'" '+ck+' onchange="onFPCheck(this,\''+col+'\')"> '+esc(v)+' <span class="fp-count">'+cnt+'</span></label>';
  }
  if(!hasBlank&&keys.length===0)h+='<div class="fp-empty">暂无数据</div>';
  h+='</div>';
  h+='<div class="fp-footer">';
  h+='<div style="display:flex;gap:4px;flex:1">';
  var sc=_addrSort.col===col?('sort-btn active sort-'+_addrSort.dir):'sort-btn';
  var st=_addrSort.col===col?(_addrSort.dir==='asc'?'↑ 升序':'↓ 降序'):'⇅ 排序';
  h+='<button class="'+sc+'" onclick="toggleAddrSort(\''+col+'\')">'+st+'</button>';
  h+='</div>';
  h+='<button class="fp-btn-clear" onclick="clearFilterPopup(\''+col+'\')">清除筛选</button>';
  h+='<button class="fp-btn-ok" onclick="applyFilterPopup(\''+col+'\')">确定</button>';
  h+='</div>';
  pop.innerHTML=h;
  // 更新全选checkbox状态
  var allChk=document.getElementById('fp-chk-all');
  if(allChk){allChk.checked=allChecked;allChk.indeterminate=anyChecked&&!allChecked}
}
function onFPCheck(el,col){
  var v=el.value;
  if(el.checked)_addrFilters[col].vals[v]=true;
  else delete _addrFilters[col].vals[v];
  updateFPCheckAll();
}
function filterPopupToggleAll(col){
  var chk=document.getElementById('fp-chk-all');
  if(!chk)return;
  var checks=document.querySelectorAll('#filter-popup .fp-list input[type=checkbox]');
  for(var i=0;i<checks.length;i++){
    checks[i].checked=chk.checked;
    if(chk.checked)_addrFilters[col].vals[checks[i].value]=true;
    else delete _addrFilters[col].vals[checks[i].value];
  }
}
function filterPopupInvert(col){
  var checks=document.querySelectorAll('#filter-popup .fp-list input[type=checkbox]');
  for(var i=0;i<checks.length;i++){
    checks[i].checked=!checks[i].checked;
    if(checks[i].checked)_addrFilters[col].vals[checks[i].value]=true;
    else delete _addrFilters[col].vals[checks[i].value];
  }
  updateFPCheckAll();
}
function filterDups(col){
  // 选中出现次数>1的值
  var search=_addrFilters[col].search||'';
  var labels=document.querySelectorAll('#filter-popup .fp-list label');
  for(var i=0;i<labels.length;i++){
    var cb=labels[i].querySelector('input[type=checkbox]');
    var cntEl=labels[i].querySelector('.fp-count');
    if(cb&&cntEl){
      var cnt=parseInt(cntEl.textContent);
      cb.checked=cnt>1;
      if(cb.checked)_addrFilters[col].vals[cb.value]=true;
      else delete _addrFilters[col].vals[cb.value];
    }
  }
  updateFPCheckAll();
}
function filterUnique(col){
  // 选中出现次数=1的值
  var labels=document.querySelectorAll('#filter-popup .fp-list label');
  for(var i=0;i<labels.length;i++){
    var cb=labels[i].querySelector('input[type=checkbox]');
    var cntEl=labels[i].querySelector('.fp-count');
    if(cb&&cntEl){
      var cnt=parseInt(cntEl.textContent);
      cb.checked=cnt===1;
      if(cb.checked)_addrFilters[col].vals[cb.value]=true;
      else delete _addrFilters[col].vals[cb.value];
    }
  }
  updateFPCheckAll();
}
function updateFPCheckAll(){
  var allChk=document.getElementById('fp-chk-all');
  if(!allChk)return;
  var checks=document.querySelectorAll('#filter-popup .fp-list input[type=checkbox]');
  var checked=0;
  for(var i=0;i<checks.length;i++)if(checks[i].checked)checked++;
  allChk.checked=checked===checks.length;
  allChk.indeterminate=checked>0&&checked<checks.length&&!allChk.checked;
}
function applyFilterPopup(col){
  var checks=document.querySelectorAll('#filter-popup .fp-list input[type=checkbox]');
  var checked=0;
  for(var i=0;i<checks.length;i++)if(checks[i].checked)checked++;
  if(checked===checks.length){
    _addrFilters[col]={enabled:false,vals:{},search:''};
  } else {
    _addrFilters[col].enabled=true;
  }
  renderAddressTable();
  closeFilterPopup();
}
function clearFilterPopup(col){
  _addrFilters[col]={enabled:false,vals:{},search:''};
  renderAddressTable();
  closeFilterPopup();
}
function toggleAddrSort(col){
  if(_addrSort.col===col){
    if(_addrSort.dir==='asc'){
      _addrSort.dir='desc';
    } else {
      _addrSort.col=null; // 第三次点击取消排序
      _addrSort.dir='asc';
    }
  } else {
    _addrSort.col=col;
    _addrSort.dir='asc';
  }
  renderAddressTable();
  closeFilterPopup();
}
// ========== 通用筛选+排序系统（所有表格共用） ==========
var _gpCtx=null; // 当前通用筛选上下文
function openGFilterPopup(col,thEl,ctx){
  if(_gpCtx&&_gpCtx.popupId===ctx.popupId&&_gpCtx.col===col){closeGFilterPopup();return}
  closeGFilterPopup();
  _gpCtx=ctx;_gpCtx.col=col;_gpCtx.thEl=thEl;
  var pop=document.getElementById('g-filter-popup');
  if(!pop){
    pop=document.createElement('div');pop.id='g-filter-popup';pop.className='filter-popup';
    document.body.appendChild(pop);
  }
  renderGFilterPopup();
  pop.style.display='block';
  var rect=thEl.getBoundingClientRect();
  pop.style.left=Math.max(5,rect.left)+'px';pop.style.top=(rect.bottom+2)+'px';
  setTimeout(function(){var inp=pop.querySelector('.fp-search input');if(inp)inp.focus()},50);
}
function closeGFilterPopup(){
  var pop=document.getElementById('g-filter-popup');
  if(pop)pop.style.display='none';
  _gpCtx=null;
}
function renderGFilterPopup(){
  var pop=document.getElementById('g-filter-popup');
  if(!pop||!_gpCtx)return;
  var ctx=_gpCtx,col=ctx.col,fs=ctx.filterState;
  var rawData=ctx.data;
  if(ctx.getDataFn)rawData=ctx.getDataFn();
  var curFil=rawData.filter(function(row){
    var ks=Object.keys(fs);
    for(var fi=0;fi<ks.length;fi++){
      var fc=ks[fi],f=fs[fc];
      if(fc===col||!f.enabled||Object.keys(f.vals).length===0)continue;
      var v=ctx.getVal(row,fc);
      if(v==null||v===''){if(!f.vals['(空)'])return false}
      else if(!f.vals[v])return false;
    }
    return true;
  });
  var vals={},total=0,hasBlank=false;
  for(var i=0;i<curFil.length;i++){
    var v=ctx.getVal(curFil[i],col);
    if(v==null||v===''){hasBlank=true;total++}
    else{vals[v]=(vals[v]||0)+1;total++}
  }
  var h='<div class="fp-search"><input placeholder="搜索值..." oninput="renderGFilterPopup()" value="'+esc(fs[col].search)+'"></div>';
  h+='<div class="fp-actions">';
  h+='<label><input type="checkbox" onchange="gFPAll()" id="gfp-chk-all"> 全选</label>';
  h+='<button onclick="gFPInv()">反选</button>';
  h+='<button onclick="gFPDups()">重复项</button>';
  h+='<button onclick="gFPUnique()">唯一项</button>';
  h+='</div><div class="fp-list">';
  var search=fs[col].search||'';
  var keys=Object.keys(vals).sort();
  var anyChecked=false,allChecked=true;
  if(hasBlank){
    var ck=fs[col].vals['(空)']?'checked':'';
    if(ck)anyChecked=true;else allChecked=false;
    var show=!search||'(空)'.indexOf(search)!==-1;
    if(show)h+='<label><input type="checkbox" value="(空)" '+ck+' onchange="onGFPCheck(this)"> (空) <span class="fp-count">'+(total-(keys.reduce(function(s,k){return s+vals[k]},0)||0))+'</span></label>';
  }
  for(var ki=0;ki<keys.length;ki++){
    var v=keys[ki],cnt=vals[v];
    if(search&&String(v).toLowerCase().indexOf(search.toLowerCase())===-1)continue;
    var ck=fs[col].vals[v]?'checked':'';
    if(ck)anyChecked=true;else allChecked=false;
    h+='<label><input type="checkbox" value="'+esc(v)+'" '+ck+' onchange="onGFPCheck(this)"> '+esc(v)+' <span class="fp-count">'+cnt+'</span></label>';
  }
  if(!hasBlank&&keys.length===0)h+='<div class="fp-empty">暂无数据</div>';
  h+='</div><div class="fp-footer">';
  h+='<div style="display:flex;gap:4px;flex:1">';
  var ss=ctx.sortState;
  var sc=ss.col===col?('sort-btn active sort-'+ss.dir):'sort-btn';
  var st=ss.col===col?(ss.dir==='asc'?'↑ 升序':'↓ 降序'):'⇅ 排序';
  h+='<button class="'+sc+'" onclick="toggleGSort()">'+st+'</button>';
  h+='</div>';
  h+='<button class="fp-btn-clear" onclick="clearGFilterPopup()">清除筛选</button>';
  h+='<button class="fp-btn-ok" onclick="applyGFilterPopup()">确定</button></div>';
  pop.innerHTML=h;
  var allChk=document.getElementById('gfp-chk-all');
  if(allChk){allChk.checked=allChecked;allChk.indeterminate=anyChecked&&!allChecked}
}
function onGFPCheck(el){
  if(!_gpCtx)return;
  var col=_gpCtx.col,fs=_gpCtx.filterState,v=el.value;
  if(el.checked)fs[col].vals[v]=true;else delete fs[col].vals[v];
  gFPUpdateAll();
}
function gFPUpdateAll(){
  var allChk=document.getElementById('gfp-chk-all');
  if(!allChk)return;
  var pop=document.getElementById('g-filter-popup');
  if(!pop)return;
  var checks=pop.querySelectorAll('.fp-list input[type=checkbox]');
  var checked=0;for(var i=0;i<checks.length;i++)if(checks[i].checked)checked++;
  allChk.checked=checked===checks.length;
  allChk.indeterminate=checked>0&&checked<checks.length&&!allChk.checked;
}
function gFPAll(){
  var chk=document.getElementById('gfp-chk-all');
  if(!chk||!_gpCtx)return;
  var col=_gpCtx.col,fs=_gpCtx.filterState;
  var checks=document.querySelectorAll('#g-filter-popup .fp-list input[type=checkbox]');
  for(var i=0;i<checks.length;i++){
    checks[i].checked=chk.checked;
    if(chk.checked)fs[col].vals[checks[i].value]=true;
    else delete fs[col].vals[checks[i].value];
  }
}
function gFPInv(){
  if(!_gpCtx)return;
  var col=_gpCtx.col,fs=_gpCtx.filterState;
  var checks=document.querySelectorAll('#g-filter-popup .fp-list input[type=checkbox]');
  for(var i=0;i<checks.length;i++){
    checks[i].checked=!checks[i].checked;
    if(checks[i].checked)fs[col].vals[checks[i].value]=true;
    else delete fs[col].vals[checks[i].value];
  }
}
function gFPDups(){
  if(!_gpCtx)return;
  var col=_gpCtx.col,fs=_gpCtx.filterState;
  var labels=document.querySelectorAll('#g-filter-popup .fp-list label');
  for(var i=0;i<labels.length;i++){
    var cb=labels[i].querySelector('input[type=checkbox]');
    var cntEl=labels[i].querySelector('.fp-count');
    if(cb&&cntEl){
      var cnt=parseInt(cntEl.textContent);
      cb.checked=cnt>1;
      if(cb.checked)fs[col].vals[cb.value]=true;else delete fs[col].vals[cb.value];
    }
  }
  gFPUpdateAll();
}
function gFPUnique(){
  if(!_gpCtx)return;
  var col=_gpCtx.col,fs=_gpCtx.filterState;
  var labels=document.querySelectorAll('#g-filter-popup .fp-list label');
  for(var i=0;i<labels.length;i++){
    var cb=labels[i].querySelector('input[type=checkbox]');
    var cntEl=labels[i].querySelector('.fp-count');
    if(cb&&cntEl){
      var cnt=parseInt(cntEl.textContent);
      cb.checked=cnt===1;
      if(cb.checked)fs[col].vals[cb.value]=true;else delete fs[col].vals[cb.value];
    }
  }
  gFPUpdateAll();
}
function applyGFilterPopup(){
  if(!_gpCtx)return;
  var col=_gpCtx.col,fs=_gpCtx.filterState;
  var pop=document.getElementById('g-filter-popup');
  var checks=pop?pop.querySelectorAll('.fp-list input[type=checkbox]'):[];
  var checked=0;
  for(var i=0;i<checks.length;i++)if(checks[i].checked)checked++;
  if(checks.length>0&&checked===checks.length){
    fs[col]={enabled:false,vals:{},search:''};
  } else {
    fs[col].enabled=true;
  }
  _gpCtx.render();
  closeGFilterPopup();
}
function clearGFilterPopup(){
  if(!_gpCtx)return;
  _gpCtx.filterState[_gpCtx.col]={enabled:false,vals:{},search:''};
  _gpCtx.render();
  closeGFilterPopup();
}
function toggleGSort(){
  if(!_gpCtx)return;
  var col=_gpCtx.col,ss=_gpCtx.sortState;
  if(ss.col===col){
    if(ss.dir==='asc')ss.dir='desc';
    else{ss.col=null;ss.dir='asc'}
  } else {
    ss.col=col;ss.dir='asc';
  }
  _gpCtx.render();
  closeGFilterPopup();
}
// ========== 通用系统结束 ==========
// 通用表格筛选+排序应用函数（各个渲染函数调用）
function applyTableFilter(data,filterState,sortState,ctx){
  // 筛选
  var ks=Object.keys(filterState);
  data=data.filter(function(row){
    for(var fi=0;fi<ks.length;fi++){
      var col=ks[fi],f=filterState[col];
      if(!f.enabled||Object.keys(f.vals).length===0)continue;
      var v=ctx.getVal(row,col);
      if(v==null||v===''){if(!f.vals['(空)'])return false}
      else if(!f.vals[v])return false;
    }
    return true;
  });
  // 排序
  if(sortState.col){
    var sc=sortState.col,dir=sortState.dir==='asc'?1:-1;
    data.sort(function(x,y){
      var vx=ctx.getVal(x,sc),vy=ctx.getVal(y,sc);
      // 数值字段
      if(ctx.numCols&&ctx.numCols.indexOf(sc)!==-1){
        vx=parseFloat(vx)||0;vy=parseFloat(vy)||0;
        return (vx<vy?-1:1)*dir;
      }
      var sx=String(vx==null?'':vx).toLowerCase();
      var sy=String(vy==null?'':vy).toLowerCase();
      if(sx<sy)return -1*dir;if(sx>sy)return 1*dir;
      return 0;
    });
  }
  return data;
}
function updateHeaderIndicators(tableEl,filterState,sortState){
  var hdr=tableEl.querySelector('thead tr:first-child');
  if(!hdr)return;
  for(var ci=0;ci<hdr.cells.length;ci++){
    var th=hdr.cells[ci],col=th.getAttribute('data-col');
    if(!col)continue;
    var ind=th.querySelector('.fp-indicator');
    if(!ind){ind=document.createElement('span');ind.className='fp-indicator';th.appendChild(ind)}
    var f=filterState[col];
    if(f&&f.enabled&&Object.keys(f.vals).length>0)ind.classList.add('active');
    else ind.classList.remove('active');
    ind.classList.remove('sort-asc','sort-desc');
    if(sortState.col===col)ind.classList.add('sort-'+sortState.dir);
  }
}

// ===== 各页面筛选+排序注册 =====
// --- 续费管理 ---
var _renewFilterDefs={bn:'业务编号',co:'单位名称',addr:'地址',sl:'业务员',nn:'客户昵称',ph:'联系电话',sd:'开始时间',ed:'结束时间',rd:'剩余天数',pm:'收款金额',rs:'续费状态',ex:'异常'};
var _renewFilters={},_renewSort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_renewFilterDefs);for(var i=0;i<ks.length;i++){_renewFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _renewCtx={popupId:'renew',getDataFn:function(){var r=[];for(var i=0;i<DB_ADDRESS.length;i++){var a=DB_ADDRESS[i];calcAddrActualRenewStatus(a);a.status=a.bn?'已占用':'空置';if(renewDF==='abnormal'){if(a.ex==='\u662f')r.push(a)}else{if(a.rd<=30&&a.ex!=='\u662f')r.push(a)}}return r},filterState:_renewFilters,sortState:_renewSort,getVal:function(a,c){return a[c]},render:renderRenewTable,numCols:['rd','pm']};

// --- 客户管理 ---
var _custFilterDefs={co:'单位名称',nn:'客户昵称',wx:'微信',phone:'联系电话',ac:'对接账号',sl:'业务员',fd:'首次成交',tp:'客户类型',tags:'标签',oc:'关联订单',totalPm:'总收款',unpaid:'未收款'};
var _custFilters={},_custSort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_custFilterDefs);for(var i=0;i<ks.length;i++){_custFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _custCtx={popupId:'cust',getDataFn:function(){return DB_CUSTOMERS||[]},filterState:_custFilters,sortState:_custSort,getVal:function(c,co){return c[co]},render:renderCustomerTable,numCols:['totalPm','unpaid']};

// --- 业绩管理 ---
var _perfFilterDefs={n:'业务员',rCnt:'地址续费',sCnt:'地址销售',oc:'订单数',income:'总收款',cost:'总成本',exp:'总支出',profit:'总利润',avg:'客单利润',nC:'新客',oC:'老客'};
var _perfFilters={},_perfSort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_perfFilterDefs);for(var i=0;i<ks.length;i++){_perfFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _perfCtx={popupId:'perf',getDataFn:function(){return window._perfData||[]},filterState:_perfFilters,sortState:_perfSort,getVal:function(r,c){if(c==='profit')return (r.income||0)-(r.cost||0)-(r.exp||0);if(c==='avg')return r.oc>0?Math.round(((r.income||0)-(r.cost||0)-(r.exp||0))/r.oc):0;return r[c]},render:renderPerformance,numCols:['income','cost','exp','profit','avg','rCnt','sCnt','oc','nC','oC']};

// --- 公司收入 ---
var _incFilterDefs={bn:'业务编号',subBn:'子订单',bt:'类型',addr:'地址',sl:'业务员',co:'单位名称',pfTime:'收款时间',pfUser:'审批人',expTime:'支出时间',payAccount:'收款账号',pm:'收款金额',cost:'成本',exp:'支出',profit:'收益'};
var _incFilters={},_incSort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_incFilterDefs);for(var i=0;i<ks.length;i++){_incFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _incCtx={popupId:'inc',getDataFn:function(){return window._incData||[]},filterState:_incFilters,sortState:_incSort,getVal:function(r,c){return r[c]},render:renderIncomeTable};

// --- 财务支出 ---
var _expFilterDefs={pfTime:'支出时间',bn:'业务编号',subBn:'子订单',sl:'业务员',co:'单位名称',expAccount:'支出账号',xm:'支出金额',cost:'成本',xf_user:'审批人',bt:'类型',rk:'备注'};
var _expFilters={},_expSort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_expFilterDefs);for(var i=0;i<ks.length;i++){_expFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _expCtx={popupId:'exp',getDataFn:function(){return getExps()},filterState:_expFilters,sortState:_expSort,getVal:function(e,c){if(c==='subBn')return (e.subBns||[]).join(',');return e[c]},render:renderExpensesTable,numCols:['xm','cost']};

// --- 账号管理 ---
var _userFilterDefs={username:'用户名',name:'姓名',account:'对接账号',payAccount:'收款账号',expAccount:'支出账号',role:'角色',createdAt:'创建时间'};
var _userFilters={},_userSort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_userFilterDefs);for(var i=0;i<ks.length;i++){_userFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _userCtx={popupId:'user',getDataFn:function(){return DB_USERS||[]},filterState:_userFilters,sortState:_userSort,getVal:function(u,c){return u[c]},render:renderUserTable};

// --- 开票申请 ---
var _invFilterDefs={bn:'业务编号',salesperson:'业务员',nick:'客户昵称',title:'受票方',category:'开票类目',priority:'优先级',amount:'开票金额',ourUnit:'我方开票单位',taxId:'税号',invType:'发票类型',status:'状态',appliedAt:'申请时间',appliedBy:'申请人',approvedBy:'审批人'};
var _invFilters={},_invSort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_invFilterDefs);for(var i=0;i<ks.length;i++){_invFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _invCtx={popupId:'inv',getDataFn:function(){return DB_INVOICES||[]},filterState:_invFilters,sortState:_invSort,getVal:function(r,c){return r[c]},render:renderInvoicePage,numCols:['amount']};
// --- 操作日志 ---
var _auditFilterDefs={ts:'时间',username:'操作人',action:'操作',table_name:'数据表',summary:'摘要'};
var _auditFilters={},_auditSort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_auditFilterDefs);for(var i=0;i<ks.length;i++){_auditFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _auditCtx={popupId:'audit',getDataFn:function(){return window._auditData||[]},filterState:_auditFilters,sortState:_auditSort,getVal:function(r,c){return r[c]},render:renderAuditLog};

// --- 工资计算 ---
var _salaryFilterDefs={ordBn:'母订单编号',subBn:'子订单编号',sales:'业务员',bt:'类型',pd:'收款时间',pm:'收款金额',cost:'成本',exp:'支出',profit:'利润',rate:'提成比例',comm:'佣金'};
var _salaryFilters={},_salarySort={col:null,dir:'asc'};
(function(){var ks=Object.keys(_salaryFilterDefs);for(var i=0;i<ks.length;i++){_salaryFilters[ks[i]]={enabled:false,vals:{},search:''}}})();
var _salaryCtx={popupId:'salary',getDataFn:function(){return window._salaryData||[]},filterState:_salaryFilters,sortState:_salarySort,getVal:function(r,c){return r[c]},render:renderSalaryPage,numCols:['pm','cost','exp','profit','comm']};
// 点击外部关闭筛选面板
document.addEventListener('mousedown',function(e){
  var pop=$('filter-popup');
  if(!pop||pop.style.display==='none')return;
  if(pop.contains(e.target)||(_fpTh&&_fpTh.contains(e.target)))return;
  closeFilterPopup();
});
// ESC键关闭筛选面板
document.addEventListener('keydown',function(e){
  if(e.key==='Escape')closeFilterPopup();
});
// 获取排除某列后的筛选数据
function getAddrFilteredData(excludeCol){
  if(!DB_ADDRESS)return[];
  for(var i=0;i<DB_ADDRESS.length;i++){var a=DB_ADDRESS[i];calcAddrActualRenewStatus(a);a.status=a.bn?'已占用':'空置'}
  return DB_ADDRESS.filter(function(a){
    var ks=Object.keys(_addrFilters);
    for(var fi=0;fi<ks.length;fi++){
      var col=ks[fi];
      if(col===excludeCol)continue;
      var f=_addrFilters[col];
      if(!f.enabled||Object.keys(f.vals).length===0)continue;
      var v=a[col];
      if(v==null||v===''){if(!f.vals['(空)'])return false}
      else if(!f.vals[v])return false;
    }
    return true;
  });
}
// ---- 列隐藏/显示（localStorage持久化） ----
function _getHiddenCols(){
  var h=localStorage.getItem('_addrHiddenCols');
  return h?JSON.parse(h):[];
}
function _saveHiddenCols(arr){
  localStorage.setItem('_addrHiddenCols',JSON.stringify(arr));
}
function toggleColumn(col){
  var h=_getHiddenCols();
  var idx=h.indexOf(col);
  if(idx===-1){h.push(col)}else{h.splice(idx,1)}
  _saveHiddenCols(h);
  renderAddressTable();
}
function resetColumns(){
  _saveHiddenCols([]);
  renderAddressTable();
}
// 右键列头菜单（同时支持地址表和订单表）
document.addEventListener('contextmenu',function(e){
  var th=e.target.closest('th[data-col]');
  if(!th)return;
  e.preventDefault();
  var col=th.getAttribute('data-col');
  // 判断属于哪个表
  var section=th.closest('section');
  var tableId=section?section.id:'';
  var toggleFn=(tableId==='page-orders')?'toggleOrderColumn(\''+col+'\')':'toggleColumn(\''+col+'\')';
  var menu=document.getElementById('col-context-menu');
  if(!menu){
    menu=document.createElement('div');menu.id='col-context-menu';
    menu.style.cssText='position:fixed;z-index:1000;background:#fff;border:1px solid #d0d5dd;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:4px 0;font-size:12px;min-width:120px';
    menu.innerHTML='<div style="padding:8px 14px;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'#f5f5f5\'" onmouseout="this.style.background=\'\'" onclick="var fn='+toggleFn+';this.closest(\'#col-context-menu\').style.display=\'none\'">隐藏「'+th.textContent+'」列</div><div style="padding:8px 14px;cursor:pointer;color:#555" onmouseover="this.style.background=\'#f5f5f5\'" onmouseout="this.style.background=\'\'" onclick="document.getElementById(\'col-context-menu\').style.display=\'none\'">取消</div>';
    document.body.appendChild(menu);
  }else{
    menu.style.display='block';
    var hideItem=menu.querySelector('div:first-child');
    if(hideItem)hideItem.textContent='隐藏「'+th.textContent+'」列';
    hideItem.onclick=function(){
      if(tableId==='page-orders')toggleOrderColumn(col);
      else toggleColumn(col);
      menu.style.display='none'
    };
  }
  menu.style.left=Math.max(5,e.clientX)+'px';
  menu.style.top=Math.max(5,e.clientY)+'px';
});
document.addEventListener('click',function(e){
  var menu=document.getElementById('col-context-menu');
  if(menu&&!menu.contains(e.target))menu.style.display='none';
  // 关闭订单筛选弹窗
  var opop=document.getElementById('order-filter-popup');
  if(opop&&opop.style.display!=='none'&&!opop.contains(e.target)){
    if(!_ofpTh||!_ofpTh.contains(e.target)){opop.style.display='none';_ofpCol=null}
  }
});

function renderAddressTable(){
  var kw=$('address-search').value.toLowerCase();
  // 计算剩余天数和续费状态
  for(var i=0;i<DB_ADDRESS.length;i++){var a=DB_ADDRESS[i];calcAddrActualRenewStatus(a);a.status=a.bn?'已占用':'空置'}
  // 筛选数据（使用_addrFilters）
  var data=DB_ADDRESS.filter(function(a){
    if(kw){var s=(a.t+a.ad+a.rm+a.bn+a.sl+a.co+a.nn+'').toLowerCase();if(s.indexOf(kw)===-1)return false}
    var ks=Object.keys(_addrFilters);
    for(var fi=0;fi<ks.length;fi++){
      var col=ks[fi],f=_addrFilters[col];
      if(!f.enabled||Object.keys(f.vals).length===0)continue;
      var v=a[col];
      if(v==null||v===''){if(!f.vals['(空)'])return false}
      else if(!f.vals[v])return false;
    }
    return true;
  });
  // 排序
  if(_addrSort.col){
    var sortCol=_addrSort.col;
    var dir=_addrSort.dir==='asc'?1:-1;
    data.sort(function(x,y){
      var vx=x[sortCol], vy=y[sortCol];
      // 特殊处理数值型字段
      if(sortCol==='pm'||sortCol==='pr'||sortCol==='cs'||sortCol==='rd'){
        vx=parseFloat(vx)||0; vy=parseFloat(vy)||0;
        return (vx<vy?-1:1)*dir;
      }
      // 字符串比较
      var sx=String(vx==null?'':vx).toLowerCase();
      var sy=String(vy==null?'':vy).toLowerCase();
      if(sx<sy)return -1*dir;
      if(sx>sy)return 1*dir;
      return 0;
    });
  } else {
    // 默认排序：1.空置在前 2.类型升序 3.地址升序 4.房间号升序
    data.sort(function(x,y){
      var sx=x.status==='空置'?0:1, sy=y.status==='空置'?0:1;
      if(sx!==sy)return sx-sy;
      var tx=(x.t||'').toLowerCase(), ty=(y.t||'').toLowerCase();
      if(tx<ty)return -1; if(tx>ty)return 1;
      var ax=(x.ad||'').toLowerCase(), ay=(y.ad||'').toLowerCase();
      if(ax<ay)return -1; if(ax>ay)return 1;
      return naturalCmp(x.rm||'',y.rm||'');
    });
  }
  // 找出重复的单位名称，重复行置顶+红底标记
  var coCount={};
  for(var i=0;i<data.length;i++){var c=(data[i].co||'').trim();if(c)coCount[c]=(coCount[c]||0)+1}
  data.forEach(function(a){a._dupCo=coCount[(a.co||'').trim()]>1});
  var dups=data.filter(function(a){return a._dupCo}),rest=data.filter(function(a){return!a._dupCo});
  data=dups.concat(rest);
  // 获取隐藏列列表
  var hiddenCols=_getHiddenCols();
  // 给表头第一行添加拖拽把手（不重复添加），并更新筛选指示器
  var addrHeaderRow=document.querySelector('section#page-address .data-table > thead > tr:first-child');
  if(addrHeaderRow){
    for(var ci=0;ci<addrHeaderRow.cells.length;ci++){
      var th=addrHeaderRow.cells[ci];
      if(!th.querySelector('.col-resizer')){
        var h=document.createElement('div');h.className='col-resizer';h.title='拖拽调整宽度';
        th.appendChild(h);
      }
      // 筛选指示器（默认所有可筛选列显示倒三角）
      var col=th.getAttribute('data-col');
      if(col&&!th.querySelector('.fp-indicator')){
        var ind=document.createElement('span');ind.className='fp-indicator';
        th.appendChild(ind);
      }
      // 更新已有指示器的激活状态和排序状态
      if(col){
        var existing=th.querySelector('.fp-indicator');
        if(existing){
          var f=_addrFilters[col];
          if(f&&f.enabled&&Object.keys(f.vals).length>0)existing.classList.add('active');
          else existing.classList.remove('active');
          // 排序状态
          existing.classList.remove('sort-asc','sort-desc');
          if(_addrSort.col===col)existing.classList.add('sort-'+_addrSort.dir);
        }
      }
    }
    // 同步隐藏列头
    for(var ci=0;ci<addrHeaderRow.cells.length;ci++){
      var th=addrHeaderRow.cells[ci];
      var col=th.getAttribute('data-col');
      if(col&&hiddenCols.indexOf(col)!==-1){th.style.display='none'}
      else{th.style.display=''}
    }
  }
  var total=data.length,tp=Math.ceil(total/PS)||1;if(ap>tp)ap=tp;var pd=data.slice((ap-1)*PS,ap*PS);
  var tb=$('address-tbody'),html='';
  var colKeys=['t','ad','rm','pr','status','bn','co','sl','nn','sd','ed','pd','pa','pm','rs','lp','ph','ex'];
  for(var i=0;i<pd.length;i++){
    var a=pd[i],dCls=a.rd<=0?'tag-red':a.rd<=30?'tag-orange':a.rd<=90?'tag-blue':'tag-green',dTxt=a.rd<=0?'超'+Math.abs(a.rd)+'天':a.rd+'天',rTag=a.rs==='需要续费'?'tag-red':'tag-green';
    var statusTag=a.status==='空置'?'<span class="tag-gray">空置</span>':'<span class="tag-green">已占用</span>';
    var exTag=a.ex==='是'?'<span class="tag-red">是</span>':'<span class="tag-gray">否</span>';
    var clearBtn='<button class="btn-warning" onclick="clearAddrInfo('+a.id+')" style="padding:2px 8px;font-size:11px">清空</button>';
    var dupCls=a._dupCo?' dup-row':'';
    html+='<tr data-id="'+a.id+'" class="'+dupCls+'">';
    var checked=_addrSelected[a.id]?' checked':'';
    html+='<td style="text-align:center"><input type="checkbox" '+checked+' onchange="toggleAddrSelect('+a.id+',this.checked)"></td>';
    html+='<td style="text-align:center;color:#888;font-size:12px">'+((ap-1)*PS+i+1)+'</td>';
    // 查找该地址对应的子订单付款记录（用于显示正确的收款信息）
    var addrFull=((a.ad||'')+(a.rm||'')).trim();
    var subPay=null;
    if(addrFull&&DB_ORDERS){
      for(var _oi=0;_oi<DB_ORDERS.length&&!subPay;_oi++){
        var _o=DB_ORDERS[_oi];
        if(!_o.items)continue;
        for(var _si=0;_si<_o.items.length&&!subPay;_si++){
          var _it=_o.items[_si];
          if(_it.addr&&_it.addr.trim()===addrFull&&hasConfirmedPay(_it)){
            subPay=_it;
          }
        }
      }
    }
    for(var ci=0;ci<colKeys.length;ci++){
      if(hiddenCols.indexOf(colKeys[ci])!==-1)continue;
      var k=colKeys[ci],v=a[k];
      if(k==='status')html+='<td>'+statusTag+'</td>';
      else if(k==='rs')html+='<td><span class="'+rTag+'">'+esc(v||'')+'</span></td>';
      else if(k==='ex')html+='<td>'+exTag+'</td>';
      else if(k==='pm')html+='<td class="income">'+esc(subPay?fmtM(getSubPay(subPay)):(v?fmtM(v):'-'))+'</td>';
      else if(k==='pa')html+='<td>'+(subPay?esc(subPay.pa||'-'):(v?esc(v):'-'))+'</td>';
      else if(k==='pd')html+='<td>'+(subPay?esc(subPay.pd||'-'):(v?esc(v):'-'))+'</td>';
      else if(k==='ad'||k==='co')html+='<td title="'+esc(v||'')+'">'+esc(v||'-')+'</td>';
      else html+='<td>'+esc(v||'-')+'</td>';
    }
    if(hiddenCols.indexOf('action')===-1)html+='<td class="td-actions"><button class="detail-btn" onclick="showAddressDetail('+a.id+')">详情</button>'+clearBtn+'<button class="btn-edit" onclick="editAddress('+a.id+')">编辑</button><button class="btn-danger" onclick="delAddress('+a.id+')">删除</button></td>';
    html+='</tr>'
  }
  tb.innerHTML=html||'<tr><td colspan="20" class="empty-state"><p>暂无数据</p></td></tr>';
  buildPg($('address-pagination'),tp,ap,function(p){ap=p;renderAddressTable()});
  // 同步更新侧边栏续费提醒红点
  var rn=0;
  for(var ri=0;ri<DB_ADDRESS.length;ri++){
    var rr=DB_ADDRESS[ri];
    if((rr.rd||(rr.ed?daysBetween(rr.ed):9999))<=30||rr.ex==='是')rn++;
  }
  $('renew-badge').textContent=rn;
  $('renew-badge').style.display=rn>0?'inline':'none';
  $('stat-renew-count').textContent=rn;
}

// 清空单条地址信息（保留类型、地址、房间号）
function clearAddrInfo(id){
  confirmDialog('确认清空该地址的详细信息？（保留类型、地址、房间号，不影响订单管理数据）',function(){
    for(var i=0;i<DB_ADDRESS.length;i++){
      if(DB_ADDRESS[i].id===id){
        var old_=DB_ADDRESS[i];
        DB_ADDRESS[i]={id:id,t:old_.t,ad:old_.ad,rm:old_.rm,followUps:old_.followUps||undefined};
        break;
      }
    }
    syncAll();
    renderAddressTable();
    toast('已清空地址信息');
    if(curPage==='renew')renderRenewTable();
  })
}
function editAddress(id){var a=null;for(var i=0;i<DB_ADDRESS.length;i++){if(DB_ADDRESS[i].id===id){a=DB_ADDRESS[i];break}}if(a)openAddrModal(a)}
// 地址详情弹窗
function showAddressDetail(id){
  var a=null;for(var i=0;i<DB_ADDRESS.length;i++){if(DB_ADDRESS[i].id===id){a=DB_ADDRESS[i];break}}
  if(!a){toast('地址不存在','error');return}
  calcAddrActualRenewStatus(a);a.status=a.bn?'已占用':'空置';
  var fields=[
    ['地址类型',a.t],['地址',a.ad],['房间号',a.rm],['状态',a.status],
    ['业务编号',a.bn],['单位名称',a.co],['业务员',a.sl],['客户昵称',a.nn],
    ['开始时间',a.sd],['结束时间',a.ed],['剩余天数',a.rd],['续费状态',a.rs],
    ['报价',a.pr],['收款金额',a.pm],['收款账号',a.pa],['收款时间',a.pd],
    ['成本',a.cs],['法人',a.lp],['联系电话',a.ph],['异常',a.ex],['备注',a.rk]
  ];
  var h='<div style="font-size:13px;line-height:1.8">';
  for(var fi=0;fi<fields.length;fi++){
    if(fields[fi][1]==null||fields[fi][1]==='')continue;
    h+='<p><strong>'+esc(fields[fi][0])+'：</strong>'+esc(String(fields[fi][1]))+'</p>';
  }
  h+='</div>';
  showModal('地址详情 - '+esc(a.ad+' '+a.rm),h,null);
}
function delAddress(id){confirmDialog('确认删除该地址？',function(){DB_ADDRESS=DB_ADDRESS.filter(function(x){return x.id!==id});syncAll();toast('已删除');renderAddressTable();if(curPage==='renew')renderRenewTable()})}

function openAddrModal(d){
  var isEdit=!!d;
  // 新增时只显示必填字段
  if(!isEdit){
    var body='<form id="af"><div class="form-grid">'
      +'<div class="form-group"><label>地址类型 <span style="color:red">*</span></label><input name="t" value="" placeholder="请输入地址类型" required/></div>'
      +'<div class="form-group"><label>房间号 <span style="color:red">*</span></label><input name="rm" value="" placeholder="请输入房间号" required/></div>'
      +'<div class="form-group full"><label>地址表述 <span style="color:red">*</span></label><input name="ad" value="" placeholder="请输入地址表述" required/></div>'
      +'<div class="form-group"><label>参考价</label><input type="number" name="pr" value="" placeholder="参考报价"/></div>'
      +'<div class="form-group"><label>成本</label><input type="number" name="cs" value="" placeholder="成本"/></div>'
      +'<div class="form-group"><label>业务编号</label><input name="bn" value="" placeholder="选填，关联订单时自动匹配"/></div>'
      +'</div></form>';
    showModal('新增地址',body,function(){
      var f=getFormData('af');
      if(!f.ad){toast('请填写地址表述','error');return}
      if(!f.t){toast('请输入地址类型','error');return}
      if(!f.rm){toast('请输入房间号','error');return}
      f.id=Date.now();
      DB_ADDRESS.push(f);
      syncAll();
      toast('已添加');
      closeAllModals();
      renderAddressTable();
    });
  } else {
    // 编辑时显示所有字段
    var _editRd=d.ed?daysBetween(d.ed):9999,_editRTxt=_editRd<=-30?'到期超过一个月':_editRd<0?'已到期':_editRd<=30?'一个月内到期':'-';
    var body='<form id="af"><div class="form-grid">'
      +'<div class="form-group"><label>地址类型</label><input name="t" value="'+esc(d?d.t:'')+'" placeholder="手动输入地址类型"/></div>'
      +'<div class="form-group"><label>房间号</label><input name="rm" value="'+esc(d?d.rm:'')+'"/></div>'
      +'<div class="form-group full"><label>地址表述</label><input name="ad" value="'+esc(d?d.ad:'')+'"/></div>'
      +'<div class="form-group"><label>业务编号</label><input name="bn" value="'+esc(d?d.bn:'')+'"/></div>'
      +'<div class="form-group"><label>业务员</label><select name="sl">'+buildSalesOpts(d,'sl')+'</select></div>'
      +'<div class="form-group"><label>对接账号</label><input name="ac" value="'+esc(d?d.ac:'')+'"/></div>'
      +'<div class="form-group"><label>客户昵称</label><input name="nn" value="'+esc(d?d.nn:'')+'"/></div>'
      +'<div class="form-group"><label>注册类型</label><select name="rt"><option value="">请选择</option><option value="个体户"'+(d&&d.rt==='个体户'?' selected':'')+'>个体户</option><option value="公司"'+(d&&d.rt==='公司'?' selected':'')+'>公司</option></select></div>'
      +'<div class="form-group full"><label>单位名称</label><input name="co" value="'+esc(d?d.co:'')+'"/></div>'
      +'<div class="form-group"><label>开始时间</label><input type="date" name="sd" value="'+esc(d?d.sd:'')+'"/></div>'
      +'<div class="form-group"><label>结束时间</label><input type="date" name="ed" value="'+esc(d?d.ed:'')+'"/></div>'
      +'<div class="form-group"><label>收款时间</label><input type="date" name="pd" value="'+esc(d?d.pd:'')+'"/></div>'
      +'<div class="form-group"><label>收款账号</label>'+buildPayAccountOpts(d?d.sl:'',d?d.pa:'','pa')+'</div>'
      +'<div class="form-group"><label>收款金额</label><input type="number" name="pm" value="'+(d?d.pm:'')+'"/></div>'
      +'<div class="form-group"><label>法人</label><input name="lp" value="'+esc(d?d.lp:'')+'"/></div>'
      +'<div class="form-group"><label>电话</label><input name="ph" value="'+esc(d?d.ph:'')+'"/></div>'
      +'<div class="form-group"><label>参考价</label><input type="number" name="pr" value="'+(d?d.pr:'')+'"/></div>'
      +'<div class="form-group"><label>成本</label><input type="number" name="cs" value="'+(d?d.cs:'')+'"/></div>'
      +'<div class="form-group"><label>续费状态</label><span style="padding:8px 0;display:inline-block;font-weight:600">'+_editRTxt+'</span></div>'
      +'<div class="form-group"><label>异常</label><select name="ex"><option value="否"'+(d&&d.ex!=='是'?' selected':'')+'>否</option><option value="是"'+(d&&d.ex==='是'?' selected':'')+'>是</option></select></div>'
      +'<div class="form-group full"><label>备注</label><textarea name="rk">'+esc(d?d.rk:'')+'</textarea></div>'
      +'</div></form>';
    showModal('编辑地址',body,function(){
      var f=getFormData('af');

      // 保存地址的完整逻辑（提取为内部函数，支持异步 confirmDialog 后调用）
      function doSave(){
        for(var i=0;i<DB_ADDRESS.length;i++){if(DB_ADDRESS[i].id===d.id)DB_ADDRESS[i]=Object.assign(DB_ADDRESS[i],f)}

        // ★★★ 地址表编辑时双向同步：更新对应子订单的所有相关字段 ★★★
        var curAddr = ((f.ad||'') + (f.rm||'')).trim(); // 当前完整地址
        var curBn = f.bn||''; // 当前业务编号（子订单编号）
        if(curAddr || curBn){
          for(var oi=0; oi<DB_ORDERS.length; oi++){
            var o = DB_ORDERS[oi];
            if(o.items){
              for(var ii=0; ii<o.items.length; ii++){
                var it = o.items[ii];
                var matchByAddr = curAddr && it.addr && (it.addr.replace(/\s+/g,'') === curAddr.replace(/\s+/g,''));
                var matchByBn = curBn && it.subBn === curBn;
                if(matchByAddr || matchByBn){
                  if(f.co!==undefined) it.co = f.co;
                  if(f.sl!==undefined) it.sl = f.sl;
                  if(f.ac!==undefined) it.ac = f.ac;
                  if(f.nn!==undefined) it.nn = f.nn;
                  if(f.rt!==undefined) it.rt = f.rt;
                  if(f.ph!==undefined) it.ph = f.ph;
                  if(f.lp!==undefined) it.lp = f.lp;
                  if(f.sd!==undefined) it.sd = f.sd;
                  if(f.ed!==undefined) it.ed = f.ed;
                  if(f.pa!==undefined) it.pa = f.pa;
                }
              }
            }
          }
        }

        syncAll();
        toast('已更新');
        closeAllModals();
        renderAddressTable();
        if(curPage==='renew')renderRenewTable();
      }

      // 如果选异常但地址未到期，先弹确认框
      if(f.ex==='是'){
        var rd=d.ed?daysBetween(d.ed):9999;
        if(rd>0){
          confirmDialog('该地址还有 '+rd+' 天到期，尚未到期。确认标记为异常？', doSave, {title:'标记异常',okText:'确认标记',okClass:'btn-danger'});
          return;
        }
      }
      doSave();
    });
  }
}

function setRenewTab(el,days){var tabs=document.querySelectorAll('.renew-tab');for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('active');el.classList.add('active');renewDF=days;renderRenewTable()}
function renderRenewTable(){
  // 动态计算剩余天数：考虑已付款的续费子订单
  for(var i=0;i<DB_ADDRESS.length;i++){var a=DB_ADDRESS[i];calcAddrActualRenewStatus(a)}
  var addrList=DB_ADDRESS;
  if(curRole==='sales')addrList=addrList.filter(function(a){return a.sl===curUser.name});
  var list=[];
  if(renewDF==='abnormal'){list=addrList.filter(function(a){return a.ex==='\u662f'}).sort(function(a,b){return a.rd-b.rd})}
  else{list=addrList.filter(function(a){return a.rd<=30&&a.ex!=='\u662f'}).sort(function(a,b){return a.rd-b.rd})}
  list=applyTableFilter(list,_renewFilters,_renewSort,_renewCtx);
  updateHeaderIndicators($('renew-tbody').parentNode,_renewFilters,_renewSort);
  var tb=$('renew-tbody'),html='';
  // 更新tab上的红点数量
  updateRenewTabBadges();
  // 更新页面标题badge（显示所有续费提醒总数）
  var hb=$('renew-header-badge');
  if(hb){
    var totalAll=addrList.filter(function(a){return a.rd<=30&&a.ex!=='\u662f'}).length
      + addrList.filter(function(a){return a.ex==='\u662f'}).length;
    hb.textContent=totalAll;hb.style.display=totalAll>0?'inline-block':'none'
  }
  for(var i=0;i<list.length;i++){var a=list[i],cls=a.rd<0?'tag-red':a.rd<=15?'tag-orange':a.rd<=30?'tag-blue':'tag-green',dTxt=a.rd<0?'超'+Math.abs(a.rd)+'天':a.rd+'天';
    // 查找该地址已有续费子订单的母订单编号
    var renewBns='';
    var fullAddr=((a.ad||'')+(a.rm||'')).trim();
    if(fullAddr){
      var foundBns=[];
      for(var oi=0;oi<DB_ORDERS.length;oi++){
        var o=DB_ORDERS[oi];
        if(o.items){
          for(var ii=0;ii<o.items.length;ii++){
            var it=o.items[ii];
            if(it.addr&&it.addr.replace(/\s+/g,'')===fullAddr.replace(/\s+/g,'')&&o.pg!=='已办结'&&it.bt==='renew'&&it.itemStatus!=='draft'&&it.itemStatus!=='rejected'&&!it.pd&&(it.pm==null||it.pm===0)){
              foundBns.push(it.subBn||o.bn);
            }
          }
        }
      }
      if(foundBns.length>0)renewBns=' <span style="color:#eab308;font-size:11px">('+foundBns.join(',')+'续费中)</span>';
    }
    // 红点：到期超过一个月=红色；已到期+异常=红色脉冲；已到期=红色；异常=橙色；即将到期(≤7天)=橙色闪烁；其他正常绿色
    var dotCls='renew-dot',dotTitle='';
    if(a.rd<-30){dotCls='renew-dot';dotTitle='到期超过一个月'}
    else if(a.rd<0&&a.ex==='是'){dotCls='renew-dot';dotTitle='已到期+异常'}
    else if(a.rd<0){dotCls='renew-dot';dotTitle='已到期'}
    else if(a.ex==='是'){dotCls='renew-dot warn';dotTitle='异常'}
    else if(a.rd<=7){dotCls='renew-dot warn';dotTitle='即将到期'}
    else{dotCls='renew-dot ok';dotTitle='正常'}
    html+='<tr><td style="text-align:center;color:#888;font-size:12px">'+(i+1)+'</td><td style="position:relative;padding-left:20px"><span class="'+dotCls+'" style="position:absolute;left:6px;top:50%;transform:translateY(-50%)" title="'+dotTitle+'"></span><a href="#" onclick="showOrderDetailByBn(\''+esc(a.bn||'').replace(/'/g,"\\'")+'\');return false" style="color:var(--blue);text-decoration:underline">'+esc(a.bn)+'</a>'+renewBns+'</td><td title="'+esc(a.co)+'">'+esc(a.co)+'</td><td>'+esc(a.ad)+' '+esc(a.rm)+'</td><td>'+esc(a.sl)+'</td><td>'+esc(a.nn)+'</td><td>'+esc(a.ph)+'</td><td>'+esc(a.sd)+'</td><td>'+esc(a.ed)+'</td><td><span class="'+cls+'" style="font-weight:600">'+dTxt+'</span></td><td class="num-income">'+(a.pm?fmtM(a.pm):'-')+'</td><td><span class="'+(a.rd<=30?'tag-orange':'tag-green')+'">'+(a.rd<=30?'需要续费':'-')+'</span></td><td><span class="'+(a.ex==='是'?'tag-red':'tag-gray')+'">'+esc(a.ex)+'</span></td><td class="td-actions"><button class="btn-warning" onclick="clearAddrInfo('+a.id+')" style="padding:2px 8px;font-size:11px">清空</button><button class="btn-view" onclick="quickRenew('+a.id+')">快速续费</button><button class="btn-edit" onclick="openFollowUp('+a.id+')" style="padding:2px 8px;font-size:11px">续费跟进</button></td></tr>'}
  tb.innerHTML=html||'<tr><td colspan="14" class="empty-state"><p>\ud83c\udf89 \u8be5\u65f6\u6bb5\u65e0\u5f85\u7eed\u8d39</p></td></tr>';
}
// 续费跟进弹窗
function getFollowUps(a){
  if(!a.followUps)return [];
  return Array.isArray(a.followUps)?a.followUps:[];
}
function openFollowUp(id){
  var a=null;for(var i=0;i<DB_ADDRESS.length;i++){if(DB_ADDRESS[i].id===id){a=DB_ADDRESS[i];break}}
  if(!a){toast('地址不存在','error');return}
  var today=todayStr();
  var followUps=getFollowUps(a);
  // 已有的跟进记录列表
  var listHtml='';
  if(followUps.length>0){
    listHtml='<div style="margin-bottom:16px"><div style="font-weight:600;color:#374151;margin-bottom:8px">跟进历史</div>';
    for(var fi=followUps.length-1;fi>=0;fi--){
      var fu=followUps[fi];
      listHtml+='<div style="background:#f9fafb;border-radius:6px;padding:10px;margin-bottom:8px;border:1px solid #e5e7eb">'
        +'<div style="font-size:12px;color:#6b7280;margin-bottom:4px">📅 '+esc(fu.time||'')+'</div>'
        +'<div style="font-size:13px;white-space:pre-wrap;line-height:1.5">'+esc(fu.note||'')+'</div></div>';
    }
    listHtml+='</div>';
  }
  var html='<div class="order-detail" onclick="event.stopPropagation()"><div class="order-detail-header"><h3>续费跟进 - '+esc(a.co||a.ad)+'</h3></div><div class="order-detail-body">'
    +listHtml
    +'<div style="border-top:1px solid #e5e7eb;padding-top:16px"><div style="font-weight:600;color:#374151;margin-bottom:12px">添加跟进</div>'
    +'<div class="form-grid"><div class="form-group"><label>跟进时间</label><input type="date" id="fu-date" value="'+esc(today)+'"/></div>'
    +'<div class="form-group full"><label>跟进进度</label><textarea id="fu-note" rows="4" style="width:100%;padding:8px;border:1px solid #d9d9d9;border-radius:6px;font-size:13px;resize:vertical" placeholder="请填写跟进情况..."></textarea></div>'
    +'</div></div></div><div class="modal-footer"><button class="btn-secondary" onclick="this.closest(\'.order-detail-overlay\').remove()">取消</button>'
    +'<button class="btn-primary" onclick="saveFollowUp('+id+')">保存</button></div></div>';
  var overlay=document.createElement('div');overlay.className='order-detail-overlay';overlay.innerHTML=html;overlay.onclick=function(){overlay.remove()};document.body.appendChild(overlay);
}
function saveFollowUp(id){
  var a=null;for(var i=0;i<DB_ADDRESS.length;i++){if(DB_ADDRESS[i].id===id){a=DB_ADDRESS[i];break}}
  if(!a){toast('地址不存在','error');return}
  var ft=$('fu-date').value;
  var fn=$('fu-note').value.trim();
  if(!fn){toast('请填写跟进进度','error');return}
  if(!a.followUps||!Array.isArray(a.followUps))a.followUps=[];
  a.followUps.push({time:ft,note:fn});
  syncAll();
  toast('跟进记录已保存');
  var ov=document.querySelector('.order-detail-overlay');
  if(ov)ov.remove();
  renderRenewTable();
}
// 更新续费tab上的数量badge
function updateRenewTabBadges(){
  for(var i=0;i<DB_ADDRESS.length;i++){var a=DB_ADDRESS[i];calcAddrActualRenewStatus(a)}
  var addrList=DB_ADDRESS;
  if(curRole==='sales')addrList=addrList.filter(function(a){return a.sl===curUser.name});
  var tabs=document.querySelectorAll('.renew-tab');
  var origTexts=['需要续费','异常企业'];
  var cNeed=addrList.filter(function(a){return a.rd<=30&&a.ex!=='\u662f'}).length;
  var ca=addrList.filter(function(a){return a.ex==='\u662f'}).length;
  for(var t=0;t<tabs.length;t++){
    var bd='',cnt=0;
    if(t===0)cnt=cNeed;else if(t===1)cnt=ca;
    if(cnt>0)bd='<span class="tab-badge">'+cnt+'</span>';
    tabs[t].innerHTML=origTexts[t]+bd;
  }
  // 同步更新侧边栏续费提醒红点（异常也计入总提醒）
  var totalRenew=cNeed+ca;
  $('renew-badge').textContent=totalRenew;
  $('renew-badge').style.display=totalRenew>0?'inline':'none';
  $('stat-renew-count').textContent=totalRenew;
}


// ========== 设置页面 ==========
function loadConfig(){
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  fetch('/api/config',{headers:{'Authorization':'Bearer '+_token}}).then(function(r){return r.json()}).then(function(data){
    if(data.ok){
      var c=data.config;
      $('cfg-address-dir').value=c.address_dir||'';
      // $('cfg-template-path').value (removed contract)=c.template_path||'';
      $('cfg-output-base').value=c.output_base||'';
      if(c.font_path)$('cfg-font-path').value=c.font_path;
      $('cfg-status').textContent='✅ 已加载配置';
    }
  }).catch(function(e){toast('加载配置失败','error');});
}
function saveConfig(){
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  var data={
    address_dir: $('cfg-address-dir').value.trim(),
    // template_path (removed).trim(),
    output_base: $('cfg-output-base').value.trim(),
    font_path: $('cfg-font-path').value.trim()
  };
  fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},body:JSON.stringify(data)})
    .then(function(r){return r.json()}).then(function(d){
      if(d.ok){
        $('cfg-status').textContent='✅ 配置已保存（部分路径需重启生效）';
      }else{
        $('cfg-status').textContent='❌ 保存失败: '+(d.error||'');
      }
    }).catch(function(e){
      toast('保存配置失败','error');
      $('cfg-status').textContent='❌ 保存失败: '+e.message;
    });
}

// ========== 汇总更新侧边栏红点（续费提醒 + 审批中心）==========
function updateNavBadges(){
  // 更新续费提醒红点
  updateRenewTabBadges();
  // 更新审批中心红点（复用已有的 updateApprovalBadge）
  updateApprovalBadge();
  // 延时重试，确保 DOM 完全就绪后再刷新计数
  if(window._navBadgeTimer)clearTimeout(window._navBadgeTimer);
  window._navBadgeTimer=setTimeout(function(){
    updateRenewTabBadges();
    updateApprovalBadge();
  },300);
}
// 计算地址实际续费状态（考虑已付款的续费子订单）
function calcAddrActualRenewStatus(a){
  // 没有业务编号的地址不参与续费计算
  if(!a.bn||a.bn===''){
    a.rd=9999;
    a.rs='无需续费';
    return;
  }
  var maxPaidEd=null;
  var maxPaidEd=null;
  var fullAddr=((a.ad||'')+(a.rm||'')).trim();
  if(fullAddr){
    for(var oi=0;oi<DB_ORDERS.length;oi++){
      var o=DB_ORDERS[oi];
      if(o.items){
        for(var ii=0;ii<o.items.length;ii++){
          var it=o.items[ii];
          if(it.addr&&it.addr.replace(/\s+/g,'')===fullAddr.replace(/\s+/g,'')){
            var isPaid=false;
            if(it.pr_records&&it.pr_records.length>0){
              isPaid=it.pr_records.some(function(r){return r.pf&&!r.prej});
            }else{
              isPaid=it.pm>0&&it.pd;
            }
            if(isPaid&&it.ed&&(!maxPaidEd||it.ed>maxPaidEd))maxPaidEd=it.ed;
          }
        }
      }
    }
  }
  a.rd=daysBetween(maxPaidEd||a.ed||'');
  a.rs=a.rd<=90?'需要续费':'无需续费';
}
function quickRenew(id){
  var a=null;for(var i=0;i<DB_ADDRESS.length;i++){if(DB_ADDRESS[i].id===id){a=DB_ADDRESS[i];break}}if(!a)return;
  var curAddr = ((a.ad||'') + (a.rm||'')).trim();
  // 计算默认时间：新开始 = 旧结束+1天，新结束 = 旧结束+1年
  var oldEd=new Date(a.ed);
  var defaultSd=new Date(oldEd);defaultSd.setDate(defaultSd.getDate()+1);
  var defaultNd=new Date(oldEd);defaultNd.setFullYear(defaultNd.getFullYear()+1);
  var fmtD=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  // 未办结母订单列表（管理员可看到所有人的，业务员只看自己的）
  var matchedOrders=[];
  for(var oi=0;oi<DB_ORDERS.length;oi++){
    var o=DB_ORDERS[oi];
    if(o.pg!=='已办结'){
      if(curUser.role==='admin'||curUser.role==='neiqin'||!o.sl||o.sl===curUser.name)matchedOrders.push(o);
    }
  }
  matchedOrders.sort(function(x,y){return y.id-x.id});
  // 选中订单的显示文本
  var selectedText='',selectedId='';
  var popupId='quick-renew-order-popup';
  var selInputId='rf-selected-order';

  showModal('快速续费 - '+esc(a.co),
    '<form id="rf"><div class="form-grid"><div class="form-group"><label>当前结束</label><input disabled value="'+esc(a.ed)+'"/></div>'
    +'<div class="form-group"><label>选择母订单</label>'
    +'<div style="display:flex;gap:4px"><input type="text" id="'+selInputId+'" readonly placeholder="点击右侧按钮选择" style="flex:1;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#f5f5f5;font-size:12px;cursor:pointer" onclick="openOrderSelectPopup('+id+')" value="'+esc(selectedText)+'"/>'
    +'<input type="hidden" name="parentOrder" id="rf-parent-order-id" value="'+selectedId+'"/>'
    +'<button type="button" class="btn-primary" style="padding:8px 12px;font-size:12px;white-space:nowrap" onclick="openOrderSelectPopup('+id+')">选择</button></div></div>'
    +'<div class="form-group"><label>新开始时间</label><input type="date" name="nsd" id="rf-nsd" value="'+fmtD(defaultSd)+'"/></div>'
    +'<div class="form-group"><label>新结束时间</label><input type="date" name="ned" id="rf-ned" value="'+fmtD(defaultNd)+'"/></div>'
    +'<div class="form-group"><label>金额</label><input type="number" name="pm" id="rf-pm" value="700"/></div>'
    +'<div class="form-group full"><label>备注</label><input name="rk" id="rf-rk"/></div>'
    +'</div></form>',
    function(){
      var f=getFormData('rf');
      if(!f.parentOrder){toast('请点击选择按钮选择要添加到的母订单','error');return}
      if(!f.ned){toast('请选择新结束时间','error');return}
      // 检查该地址是否已有其他母订单在续费中
      var existingOrders=[];
      var checkAddr=(a.ad||'')+(a.rm||'');
      if(checkAddr){
        for(var oi=0;oi<DB_ORDERS.length;oi++){
          var o=DB_ORDERS[oi];
          if(o.id!=f.parentOrder&&o.items){
            for(var ii=0;ii<o.items.length;ii++){
              var it=o.items[ii];
              if(it.addr&&it.addr.replace(/\s+/g,'')===checkAddr.replace(/\s+/g,'')&&o.pg!=='已办结'&&it.bt==='renew'&&it.itemStatus!=='draft'&&it.itemStatus!=='rejected'&&!it.pd&&(it.pm==null||it.pm===0)){
                existingOrders.push(it.subBn||o.bn);
              }
            }
          }
        }
      }
      if(existingOrders.length>0){
        confirmDialog('当前续费订单已有订单编号为 '+existingOrders.join(',')+' 的订单在续费，是否需要再次添加？', doAddRenewItem, {title:'续费提醒',okText:'继续添加',okClass:'btn-primary'});
        return;
      }
      doAddRenewItem();

      function doAddRenewItem(){
      var newItem={addr:(a.ad||'')+(a.rm||''),rt:a.rt,sd:f.nsd,ed:f.ned,pr:f.pm,pd:'',pa:'',pm:0,cost:a.cs||200,xd:'',xa:'',xt:'',xm:0,profit:(parseFloat(f.pm)||0)-(a.cs||200),co:a.co||'',ph:a.ph||'',lp:a.lp||'',rk:'',itemStatus:'pending',bt:'renew'};
      var targetOrder=null;
      for(var oi=0;oi<DB_ORDERS.length;oi++){if(DB_ORDERS[oi].id==f.parentOrder){targetOrder=DB_ORDERS[oi];break}}
      if(targetOrder){
        // 检查目标订单是否已有该地址的续费记录
        if(targetOrder.items){
          var existRenew=targetOrder.items.some(function(it){
            return it.bt==='renew'&&it.addr===newItem.addr&&it.itemStatus!=='draft';
          });
          if(existRenew){
            toast('该母订单已有此地址的续费记录，请先删除原有续费再添加','error');
            return;
          }
        }
        var subNum=1;
        if(targetOrder.items&&targetOrder.items.length>0){
          var maxSub=0;
          for(var si=0;si<targetOrder.items.length;si++){
            var sbn=targetOrder.items[si].subBn||'';var num=parseInt(sbn.replace(targetOrder.bn+'-',''));if(num>maxSub)maxSub=num;
          }
          subNum=maxSub+1;
        }
        newItem.subBn=targetOrder.bn+'-'+String(subNum).padStart(2,'0');
        if(!targetOrder.items)targetOrder.items=[];
        targetOrder.items.push(newItem);
        if(targetOrder.pg==='已办结'){targetOrder.pg='跟进中';}
        syncAll();
        toast('已添加到 '+esc(targetOrder.bn));
        closeAllModals();renderRenewTable();
      }
    }
    });
}
function openOrderSelectPopup(addrId){
  var a=null;for(var i=0;i<DB_ADDRESS.length;i++){if(DB_ADDRESS[i].id===addrId){a=DB_ADDRESS[i];break}}if(!a)return;
  renderOrderSelectList(addrId,a);
}
function renderOrderSelectList(addrId,a){
  var matchedOrders=[];
  for(var oi=0;oi<DB_ORDERS.length;oi++){
    var o=DB_ORDERS[oi];
    if(o.pg!=='已办结'){
      if(curUser.role==='admin'||curUser.role==='neiqin'||!o.sl||o.sl===curUser.name)matchedOrders.push(o);
    }
  }
  matchedOrders.sort(function(x,y){return y.id-x.id});
  var listHtml='<div style="max-height:400px;overflow-y:auto;font-size:13px">';
  listHtml+='<table style="width:100%;border-collapse:collapse">';
  listHtml+='<thead><tr style="background:#f3f4f6;position:sticky;top:0"><th style="padding:6px 8px;text-align:center">业务编号</th><th style="padding:6px 8px;text-align:center">客户昵称</th><th style="padding:6px 8px;text-align:center">业务员</th><th style="padding:6px 8px;text-align:center">进度</th><th style="padding:6px 8px;text-align:center">子订单</th><th style="padding:6px 8px;text-align:center">总收款</th><th style="padding:6px 8px;text-align:center">操作</th></tr></thead><tbody>';
  // 新增订单行
  listHtml+='<tr style="background:#fefce8;border-bottom:2px solid #eab308"><td colspan="7" style="padding:8px;text-align:center">';
  listHtml+='<button class="btn-primary" style="padding:6px 20px;font-size:13px;font-weight:600" onclick="closeModal();setTimeout(function(){window._quickRenewAddrId='+addrId+';openOrderModal(null,{nn:\''+esc(a.nn||'')+'\',wx:\''+esc(a.wx||'')+'\',phone:\''+esc(a.ph||'')+'\'});},100)">+ 新增母订单</button>'
  +'</td></tr>';
  if(matchedOrders.length===0){
    listHtml+='<tr><td colspan="7" style="padding:30px;text-align:center;color:#9ca3af">暂无未办结的母订单</td></tr>';
  }
  for(var oi=0;oi<matchedOrders.length;oi++){
    var o=matchedOrders[oi];
    sumOrder(o);
    var ic=o.items?o.items.filter(function(it){return it.addr&&it.addr.trim();}).length:0;
    var cls=oi%2===0?'background:#fff':'background:#fafafa';
    listHtml+='<tr style="'+cls+';border-bottom:1px solid #e5e7eb">';
    listHtml+='<td style="padding:6px 8px;text-align:center;font-weight:600">'+esc(o.bn)+'</td>';
    listHtml+='<td style="padding:6px 8px;text-align:center">'+esc(o.nn||o.co||'-')+'</td>';
    listHtml+='<td style="padding:6px 8px;text-align:center">'+esc(o.sl||'-')+'</td>';
    listHtml+='<td style="padding:6px 8px;text-align:center"><span class="tag-'+(o.pg==='已办结'?'green':'blue')+'">'+esc(o.pg||'跟进中')+'</span></td>';
    listHtml+='<td style="padding:6px 8px;text-align:center">'+ic+'单</td>';
    listHtml+='<td style="padding:6px 8px;text-align:center;color:#059669;font-weight:600">'+fmtM(o.pm_total||0)+'</td>';
    listHtml+='<td style="padding:6px 8px;text-align:center"><button class="btn-primary" style="padding:4px 12px;font-size:11px" onclick="selectOrderForRenew('+o.id+')">选择</button></td>';
    listHtml+='</tr>';
  }
  listHtml+='</tbody></table></div>';
  showModal('选择母订单',listHtml,null,true);
}
// 选择订单回调
function selectOrderForRenew(oid){
  var o=null;for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].id===oid){o=DB_ORDERS[i];break}}
  if(!o)return;
  var ic=o.items?o.items.filter(function(it){return it.addr&&it.addr.trim();}).length:0;
  window._selectedOrderId=oid;
  window._selectedOrderText='【'+o.bn+'】'+(o.co||'')+' ('+ic+'单)';
  // 更新 Modal 栈中保存的表单值（closeModal 恢复弹窗时会用这个值）
  if(window._modalStack&&window._modalStack.length>0){
    var top=window._modalStack[window._modalStack.length-1];
    if(top&&top.formValues){
      top.formValues['parentOrder']={value:String(window._selectedOrderId),disabled:false,type:'hidden'};
      // 同时更新显示文本输入框（虽然没 name 属性，但手动加到 formValues 里）
      top.formValues['orderDisplay']={value:window._selectedOrderText,disabled:false,type:'text'};
    }
  }
  closeModal();
  // 恢复弹窗后重新设置输入框的值（closeModal 前 DOM 已被替换，获取不到元素）
  var sIn=document.getElementById('rf-selected-order');
  var hIn=document.getElementById('rf-parent-order-id');
  if(sIn)sIn.value=window._selectedOrderText;
  if(hIn)hIn.value=String(window._selectedOrderId);
}
var _expandedCustomers={};
function toggleCustomer(key){
  _expandedCustomers[key]=!_expandedCustomers[key];
  renderOrdersTable();
  // 展开子订单后强制重排（移动端 Safari 需要）
  var tb=document.getElementById('orders-tbody');
  if(tb){void tb.offsetHeight;setTimeout(function(){void(tb.offsetHeight);},100);}
}
// ---- 订单表列头筛选面板 ----
var _orderFilterDefs={
  bn:'业务编号',ic:'地址总数',sl:'业务员',nn:'客户昵称',ac:'对接账号',
  ct:'客户类型',pg:'跟进进度',pr_total:'总报价',pm_total:'总收款',
  unpaid:'未收款',
  cost_total:'总成本',exp_total:'总支出',profit_total:'总收益',nq:'内勤',rm:'备注'
};
var _orderFilters={},_ofpCol=null,_ofpTh=null;
var _orderSort={col:null,dir:'asc'};
(function(){
  var ks=Object.keys(_orderFilterDefs);
  for(var i=0;i<ks.length;i++){var k=ks[i];_orderFilters[k]={enabled:false,vals:{},search:''}}
})();
function openOrderFilterPopup(col,thEl){
  console.log('openOrderFilterPopup called:',col);
  try{
  if(_ofpCol===col){closeOrderFilterPopup();_ofpCol=null;return}
  closeOrderFilterPopup();
  _ofpCol=col;_ofpTh=thEl;
  // 创建订单专用的筛选弹窗
  var pop=document.getElementById('order-filter-popup');
  if(!pop){
    pop=document.createElement('div');pop.id='order-filter-popup';pop.className='filter-popup';
    document.body.appendChild(pop);
  }
  renderOrderFilterPopup(col);
  pop.style.display='block';
  var rect=thEl.getBoundingClientRect();
  pop.style.left=Math.max(5,rect.left)+'px';pop.style.top=(rect.bottom+2)+'px';
  setTimeout(function(){var inp=pop.querySelector('.fp-search input');if(inp)inp.focus()},50);
  }catch(e){console.error('openOrderFilterPopup error:',e)}
}
function renderOrderFilterPopup(col){
  try{
  var pop=document.getElementById('order-filter-popup');if(!pop)return;
  var curFil=getOrderFilteredData(col);
  var vals={},total=0,hasBlank=false;
  for(var i=0;i<curFil.length;i++){
    var o=curFil[i];sumOrder(o);
    var v=getOrderColVal(o,col);
    if(v==null||v===''){hasBlank=true;total++}
    else{vals[v]=(vals[v]||0)+1;total++}
  }
  var h='<div class="fp-search"><input placeholder="搜索值..." oninput="renderOrderFilterPopup(\''+col+'\')" value="'+esc(_orderFilters[col].search)+'"></div>';
  h+='<div class="fp-actions">';
  h+='<label><input type="checkbox" onchange="orderFPAll(\''+col+'\')" id="ofp-chk-all"> 全选</label>';
  h+='<button onclick="orderFPInv(\''+col+'\')">反选</button>';
  h+='<button onclick="orderFPDups(\''+col+'\')">重复项</button>';
  h+='<button onclick="orderFPUnique(\''+col+'\')">唯一项</button>';
  h+='</div><div class="fp-list">';
  var search=_orderFilters[col].search||'';
  var keys=Object.keys(vals).sort();
  if(hasBlank){
    var ck=_orderFilters[col].vals['(空)']?'checked':'';
    var show=!search||'(空)'.indexOf(search)!==-1;
    if(show)h+='<label><input type="checkbox" value="(空)" '+ck+' onchange="onOrderFPCheck(this,\''+col+'\')"> (空) <span class="fp-count">'+(total-(keys.length?keys.reduce(function(s,k){return s+vals[k]},0):0))+'</span></label>'
  }
  for(var ki=0;ki<keys.length;ki++){
    var v=keys[ki],cnt=vals[v];
    if(search&&String(v).toLowerCase().indexOf(search.toLowerCase())===-1)continue;
    var ck=_orderFilters[col].vals[v]?'checked':'';
    h+='<label><input type="checkbox" value="'+esc(v)+'" '+ck+' onchange="onOrderFPCheck(this,\''+col+'\')"> '+esc(v)+' <span class="fp-count">'+cnt+'</span></label>';
  }
  if(!hasBlank&&keys.length===0)h+='<div class="fp-empty">暂无数据</div>';
  h+='</div><div class="fp-footer">';
  h+='<div style="display:flex;gap:4px;flex:1">';
  var osc=_orderSort.col===col?('sort-btn active sort-'+_orderSort.dir):'sort-btn';
  var ost=_orderSort.col===col?(_orderSort.dir==='asc'?'↑ 升序':'↓ 降序'):'⇅ 排序';
  h+='<button class="'+osc+'" onclick="toggleOrderSort(\''+col+'\')">'+ost+'</button>';
  h+='</div>';
  h+='<button class="fp-btn-clear" onclick="clearOrderFilterPopup(\''+col+'\')">清除筛选</button>';
  h+='<button class="fp-btn-ok" onclick="applyOrderFilterPopup(\''+col+'\')">确定</button></div>';
  pop.innerHTML=h;
  updateOrderFPAll();
  }catch(e){console.error('Filter popup error:',e)}
}
function getOrderColVal(o,col){
  if(col==='ic')return (o.items?o.items.filter(function(it){return it.addr&&it.addr.trim();}).length:0)+'';
  if(col==='unpaid')return Math.max((o.pr_total||0)-(o.pm_total||0),0)+'';
  return o[col];
}
function onOrderFPCheck(el,col){
  var v=el.value;
  if(el.checked)_orderFilters[col].vals[v]=true;
  else delete _orderFilters[col].vals[v];
  updateOrderFPAll();
}
function updateOrderFPAll(){
  var allChk=document.getElementById('ofp-chk-all');
  if(!allChk)return;
  var pop=document.getElementById('order-filter-popup');
  if(!pop)return;
  var checks=pop.querySelectorAll('.fp-list input[type=checkbox]');
  var checked=0;for(var i=0;i<checks.length;i++)if(checks[i].checked)checked++;
  allChk.checked=checked===checks.length;
  allChk.indeterminate=checked>0&&checked<checks.length&&!allChk.checked;
}
function orderFPAll(col){
  var chk=document.getElementById('ofp-chk-all');
  if(!chk)return;
  var pop=document.getElementById('order-filter-popup');
  if(!pop)return;
  var checks=pop.querySelectorAll('.fp-list input[type=checkbox]');
  for(var i=0;i<checks.length;i++){
    checks[i].checked=chk.checked;
    if(chk.checked)_orderFilters[col].vals[checks[i].value]=true;
    else delete _orderFilters[col].vals[checks[i].value];
  }
}
function orderFPInv(col){
  var pop=document.getElementById('order-filter-popup');
  if(!pop)return;
  var checks=pop.querySelectorAll('.fp-list input[type=checkbox]');
  for(var i=0;i<checks.length;i++){
    checks[i].checked=!checks[i].checked;
    if(checks[i].checked)_orderFilters[col].vals[checks[i].value]=true;
    else delete _orderFilters[col].vals[checks[i].value];
  }
  updateOrderFPAll();
}
function orderFPDups(col){
  var pop=document.getElementById('order-filter-popup');
  if(!pop)return;
  var labels=pop.querySelectorAll('.fp-list label');
  for(var i=0;i<labels.length;i++){
    var cb=labels[i].querySelector('input[type=checkbox]');
    var cntEl=labels[i].querySelector('.fp-count');
    if(cb&&cntEl){
      var cnt=parseInt(cntEl.textContent);
      cb.checked=cnt>1;
      if(cb.checked)_orderFilters[col].vals[cb.value]=true;else delete _orderFilters[col].vals[cb.value];
    }
  }
  updateOrderFPAll();
}
function orderFPUnique(col){
  var pop=document.getElementById('order-filter-popup');
  if(!pop)return;
  var labels=pop.querySelectorAll('.fp-list label');
  for(var i=0;i<labels.length;i++){
    var cb=labels[i].querySelector('input[type=checkbox]');
    var cntEl=labels[i].querySelector('.fp-count');
    if(cb&&cntEl){
      var cnt=parseInt(cntEl.textContent);
      cb.checked=cnt===1;
      if(cb.checked)_orderFilters[col].vals[cb.value]=true;else delete _orderFilters[col].vals[cb.value];
    }
  }
  updateOrderFPAll();
}
function applyOrderFilterPopup(col){
  var pop=document.getElementById('order-filter-popup');
  var checks=pop?pop.querySelectorAll('.fp-list input[type=checkbox]'):[];
  var checked=0;
  for(var i=0;i<checks.length;i++)if(checks[i].checked)checked++;
  if(checks.length>0&&checked===checks.length){
    _orderFilters[col]={enabled:false,vals:{},search:''};
  } else {
    _orderFilters[col].enabled=true;
  }
  renderOrdersTable();closeOrderFilterPopup();_ofpCol=null;
}
function clearOrderFilterPopup(col){
  _orderFilters[col]={enabled:false,vals:{},search:''};renderOrdersTable();closeOrderFilterPopup();_ofpCol=null;
}
function toggleOrderSort(col){
  if(_orderSort.col===col){
    if(_orderSort.dir==='asc'){
      _orderSort.dir='desc';
    } else {
      _orderSort.col=null; // 第三次点击取消排序
      _orderSort.dir='asc';
    }
  } else {
    _orderSort.col=col;
    _orderSort.dir='asc';
  }
  renderOrdersTable();closeOrderFilterPopup();_ofpCol=null;
}
function closeOrderFilterPopup(){
  var pop=document.getElementById('order-filter-popup');
  if(pop)pop.style.display='none';
}
function getOrderFilteredData(excludeCol){
  if(!DB_ORDERS)return[];
  return DB_ORDERS.filter(function(o){
    var ks=Object.keys(_orderFilters);
    for(var fi=0;fi<ks.length;fi++){
      var col=ks[fi],f=_orderFilters[col];
      if(col===excludeCol)continue;
      if(!f.enabled||Object.keys(f.vals).length===0)continue;
      var v=getOrderColVal(o,col);
      if(v==null||v===''){if(!f.vals['(空)'])return false}
      else if(!f.vals[v])return false;
    }
    return true;
  });
}
// ---- 订单表列隐藏 ----
function _getOrderHiddenCols(){
  var h=localStorage.getItem('_orderHiddenCols');return h?JSON.parse(h):[];
}
function _saveOrderHiddenCols(arr){
  localStorage.setItem('_orderHiddenCols',JSON.stringify(arr));
}
function toggleOrderColumn(col){
  var h=_getOrderHiddenCols();
  var idx=h.indexOf(col);if(idx===-1)h.push(col);else h.splice(idx,1);
  _saveOrderHiddenCols(h);renderOrdersTable();
}
function resetOrderColumns(){
  _saveOrderHiddenCols([]);renderOrdersTable();
}
// 订单表列头筛选面板的文档事件（复用地址表的部分事件）
function renderOrdersTable(){
  try{
  // 内勤每次登录/刷新默认筛选内勤为登录账号
  if(curRole==='neiqin'&&!window._orderNqFilter){
    window._orderNqFilter=true;
    _orderFilters['nq']={enabled:true,vals:{},search:''};
    _orderFilters['nq'].vals[curUser.name]=true;
  }
  var kw=$('order-search').value.toLowerCase();
  var data=DB_ORDERS.filter(function(o){sumOrder(o);if(kw){var s=(o.bn+o.nn+o.co+o.sl+o.ac+o.wx+o.rm+o.bt+(o.ct||'')+(o.pg||'')+(o.nq||'')).toLowerCase();if(o.items){for(var _i=0;_i<o.items.length;_i++){var _it=o.items[_i];s+=(_it.subBn||'')+(_it.co||'')+(_it.addr||'')+(_it.sd||'')+(_it.ed||'')+(_it.pr||'')+(_it.pd||'')+(_it.pa||'')+(_it.pm||'')+(_it.xm||'')+(_it.cost||'')+(_it.rk||'')+(_it.profit||'')+(_it.itemStatus||'')}}return s.indexOf(kw)!==-1}return true});
  // 自动更新订单阶段（静默执行）
  for(var ai=0;ai<DB_ORDERS.length;ai++){updateParentOrderStatus(DB_ORDERS[ai],true);}
  // 销售员只能看到自己名下的订单
  if(curRole==='sales'){data=data.filter(function(o){return o.sl===curUser.name;});}
  // 跟进进度：总收款>=总报价 且 所有子订单都有收款且>=报价 → 已办结
  var getProgress=function(o){
    if(!o.items||o.items.length===0) return '跟进中';
    if(o.pm_total < o.pr_total) return '跟进中';
    if(o.items&&o.items.length>0){
      for(var gi=0;gi<o.items.length;gi++){
        var git=o.items[gi];
        // 计算该子订单的实际收款（只计审批通过的）
        var subPay=0;
        var subRecs=git.pr_records||[];
        for(var gp=0;gp<subRecs.length;gp++){
          if(subRecs[gp].pf) subPay+=(subRecs[gp].pm||0);
        }
        // 如果子订单没有 pr_records，用 it.pm 兼容旧数据
        if(subRecs.length===0) subPay=(git.pm||0);
        // 没有收款记录或收款 < 报价 → 跟进中
        if(subPay<=0||subPay<(git.pr||0)) return '跟进中';
      }
    }
    return '已办结';
  };
  // 订单表筛选面板过滤
  data=data.filter(function(o){
    var ks=Object.keys(_orderFilters);
    for(var fi=0;fi<ks.length;fi++){
      var col=ks[fi],f=_orderFilters[col];
      if(!f.enabled||Object.keys(f.vals).length===0)continue;
      var v=getOrderColVal(o,col);
      if(v==null||v===''){if(!f.vals['(空)'])return false}
      else if(!f.vals[v])return false;
    }
    return true;
  });
  // 订单排序
  if(_orderSort.col){
    var sortCol=_orderSort.col;
    var dir=_orderSort.dir==='asc'?1:-1;
    data.sort(function(x,y){
      sumOrder(x);sumOrder(y);
      var vx=getOrderColVal(x,sortCol);
      var vy=getOrderColVal(y,sortCol);
      // 数值字段转为数字比较
      if(sortCol==='pr_total'||sortCol==='pm_total'||sortCol==='cost_total'||sortCol==='exp_total'||sortCol==='profit_total'||sortCol==='unpaid'||sortCol==='ic'){
        vx=parseFloat(vx)||0; vy=parseFloat(vy)||0;
        return (vx<vy?-1:1)*dir;
      }
      var sx=String(vx==null?'':vx).toLowerCase();
      var sy=String(vy==null?'':vy).toLowerCase();
      if(sx<sy)return -1*dir;
      if(sx>sy)return 1*dir;
      return 0;
    });
  }
  var PS_ORD=PS;if(og>Math.ceil(data.length/PS_ORD))og=Math.ceil(data.length/PS_ORD)||1;
  var vis=data.slice((og-1)*PS_ORD,og*PS_ORD);
  var hiddenCols=_getOrderHiddenCols();
  var ctTag={'新客户':'tag-purple','老客户':'tag-gray'};
  var tb=$('orders-tbody'),html='';
  for(var g=0;g<vis.length;g++){
    var o=vis[g];
    sumOrder(o);
    var expanded=!!_expandedCustomers[o.bn||o.id];
    var ic=o.items?o.items.filter(function(it){return it.addr&&it.addr.trim();}).length:0;
    // 进度由所有子订单状态决定
    var pg=getProgress(o);
    var pgCls=pg==='已办结'?'green':'blue';
    var asCls=ap==='pending'?'orange':ap==='approved'?'green':ap==='rejected'?'red':'gray';
    var locked=false;
    // 主行
    var hasItems=o.items&&o.items.length>0;
    html+='<tr class="order-parent-row" style="cursor:'+(hasItems?'pointer':'default')+'" onclick="'+(hasItems?'toggleCustomer(\''+esc(o.bn||o.id||'').replace(/'/g,"\\'")+'\')':'')+'">';
    // 第0列：展开按钮（不隐藏）
    html+='<td style="width:44px;text-align:center"><button class="caret-btn'+(expanded?'':' collapsed')+'" onclick="event.stopPropagation();'+(hasItems?'toggleCustomer(\''+esc(o.bn||o.id||'').replace(/'/g,"\\'")+'\')':'')+'" title="'+(hasItems?(expanded?'收起':'展开子订单'):'无子订单')+'" style="width:28px;height:28px;z-index:1;opacity:'+(hasItems?'1':'0.3')+';cursor:'+(hasItems?'pointer':'not-allowed')+'"><span class="caret-icon">▼</span></button></td>';
    html+='<td style="text-align:center;color:#888;font-size:12px">'+((og-1)*PS_ORD+g+1)+'</td>';
    html+='<td data-col="od" style="text-align:center;font-size:12px;color:#6b7280">'+esc(o.od||'-')+'</td>';
    html+='<td data-col="bn" style="text-align:center"><a href="#" onclick="showOrderDetailByBn(\''+esc(o.bn||'').replace(/'/g,"\\'")+'\');return false" style="color:var(--blue);text-decoration:underline">'+esc(o.bn||'-')+'</a></td>';
    html+='<td data-col="ic" style="text-align:center">'+ic+'</td>';
    html+='<td data-col="sl" style="text-align:center">'+esc(o.sl||'-')+'</td>';
    html+='<td data-col="nn" style="text-align:center">'+esc(o.nn||'-')+'</td>';
    html+='<td data-col="ac" style="text-align:center">'+esc(o.ac||'-')+'</td>';
    html+='<td data-col="ct" style="text-align:center"><span class="'+(ctTag[o.ct]||'tag-gray')+'">'+esc(o.ct||'新客户')+'</span></td>';
    html+='<td data-col="pg" style="text-align:center"><span class="tag-'+pgCls+'">'+pg+'</span></td>';
    html+='<td data-col="pr_total" class="num-income" style="text-align:center">'+(o.pr_total?fmtM(o.pr_total):'-')+'</td>';
    html+='<td data-col="pm_total" class="num-income" style="text-align:center">'+(o.pm_total?fmtM(o.pm_total):'-')+'</td>';
    var up=Math.max((o.pr_total||0)-(o.pm_total||0),0);
    html+='<td data-col="unpaid" class="num-exp" style="text-align:center">'+(up>0?fmtM(up):'<span style="color:#999">-</span>')+'</td>';
    html+='<td data-col="cost_total" class="num-cost" style="text-align:center">'+(o.cost_total?fmtM(o.cost_total):'-')+'</td>';
    html+='<td data-col="exp_total" class="num-cost" style="text-align:center">'+(o.exp_total?fmtM(o.exp_total):'-')+'</td>';
    html+='<td data-col="profit_total" class="num-profit" style="text-align:center">'+fmtM(o.profit_total)+'</td>';
    html+='<td data-col="nq" style="text-align:center">'+esc(o.nq||'-')+'</td>';
    html+='<td data-col="rm" title="'+esc(o.rm||'')+'" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">'+esc(o.rm||'-')+'</td>';
    html+='<td class="td-actions" onclick="event.stopPropagation()">';
    // 添加子订单按钮
    html+='<button class="btn-primary" onclick="addSubOrder('+o.id+')">+ 添加子订单</button>';
    html+='<button class="btn-edit" onclick="editOrder('+o.id+')">编辑</button>';
    // 批量操作按钮
    html+='<button class="btn-edit" onclick="openPayFromParent('+o.id+')" style="padding:2px 8px;font-size:11px;background:var(--green);color:#fff">收款</button>';
    // 母订单支出按钮 - 全员可见
    html+='<button class="btn-edit" onclick="openExpFromParent('+o.id+')" style="padding:2px 8px;font-size:11px;background:var(--orange);color:#fff">支出</button>';
    html+='<button class="btn-danger" onclick="delOrder('+o.id+')">删除</button>';
    html+='</td>';
    html+='</tr>';
    // 展开子行：根据子订单状态控制编辑权限
    if(expanded&&o.items&&o.items.length>0){
      // 子订单表头 - 使用flex布局，支持拖拽调整宽度
      var subColWidths=window.subOrderColWidths||{subBn:130,bt:70,subOd:90,co:120,addr:150,sd:100,ed:100,pr:70,pd:100,pa:90,pm:70,xa:80,xm:70,cost:70,profit:60,rk:100,action:80};
      var headerId='suborder-header-'+o.id;
      html+='<tr class="order-sub-header"><td colspan="19" style="padding:0;border:none;background:#f8fafc"><div id="'+headerId+'" class="suborder-header" style="display:flex;align-items:center;padding:8px 0;font-size:12px;font-weight:600;color:#64748b;border-bottom:2px solid #e5e7eb;user-select:none">';
      html+='<span class="sub-col" data-col="subBn" style="flex:0 0 '+subColWidths.subBn+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">子订单编号</span>';
      html+='<span class="sub-col" data-col="subOd" style="flex:0 0 '+subColWidths.subOd+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">子订单时间</span>';
      html+='<span class="sub-col" data-col="bt" style="flex:0 0 '+subColWidths.bt+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">业务类型</span>';
      html+='<span class="sub-col" data-col="co" style="flex:0 0 '+subColWidths.co+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">单位名称</span>';
      html+='<span class="sub-col" data-col="addr" style="flex:0 0 '+subColWidths.addr+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">地址</span>';
      html+='<span class="sub-col" data-col="sd" style="flex:0 0 '+subColWidths.sd+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">开始时间</span>';
      html+='<span class="sub-col" data-col="ed" style="flex:0 0 '+subColWidths.ed+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">结束时间</span>';
      html+='<span class="sub-col" data-col="pr" style="flex:0 0 '+subColWidths.pr+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">报价</span>';
      html+='<span class="sub-col" data-col="pd" style="flex:0 0 '+subColWidths.pd+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">收款时间</span>';
      html+='<span class="sub-col" data-col="pa" style="flex:0 0 '+subColWidths.pa+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">收款账号</span>';
      html+='<span class="sub-col" data-col="pm" style="flex:0 0 '+subColWidths.pm+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">收款金额</span>';
      html+='<span class="sub-col" data-col="xa" style="flex:0 0 '+subColWidths.xa+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">支出账号</span>';
      html+='<span class="sub-col" data-col="xm" style="flex:0 0 '+subColWidths.xm+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">支出金额</span>';
      html+='<span class="sub-col" data-col="cost" style="flex:0 0 '+subColWidths.cost+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">成本</span>';
      html+='<span class="sub-col" data-col="profit" style="flex:0 0 '+subColWidths.profit+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">收益</span>';
      html+='<span class="sub-col" data-col="rk" style="flex:0 0 '+subColWidths.rk+'px;padding-right:8px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;border-right:1px solid #cbd5e1">备注</span>';
      html+='<span class="sub-col" data-col="action" style="flex:1 1 '+subColWidths.action+'px;position:relative;cursor:col-resize;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left">操作</span>';
      html+='</div></td></tr>';
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        var itemStatus=it.itemStatus||'draft';

        // 【支出状态】仅在 xr 有记录时显示
        var expStatus='';
        if(it.xr&&it.xr.length>0){
          var hasExpPending=false,hasExpRejected=false,hasExpConfirmed=false;
          for(var ek=0;ek<it.xr.length;ek++){
            var xr=it.xr[ek];
            if(!xr.xf&&!xr.xrej)hasExpPending=true;
            if(xr.xrej)hasExpRejected=true;
            if(xr.xf)hasExpConfirmed=true;
          }
          if(hasExpPending) expStatus='<span class="tag-orange" style="font-size:10px">支出:待审批</span>';
          else if(hasExpRejected) expStatus='<span class="tag-red" style="font-size:10px">支出:已驳回</span>';
          else if(hasExpConfirmed) expStatus='<span class="tag-green" style="font-size:10px">支出:已支出</span>';
          else expStatus='<span class="tag-gray" style="font-size:10px">支出:待支出</span>';
        }
        var canDel=(curRole==='admin'||itemStatus!=='approved');
        var delBtn=canDel?'<button class="btn-danger" onclick="event.stopPropagation();delSubOrder('+o.id+','+j+')" style="padding:2px 8px;font-size:11px">删除</button>':'<button class="btn-danger" disabled style="padding:2px 8px;font-size:11px;opacity:0.4">删除</button>';
        var currentAddr=(it.addr||'').trim();
        // 子订单数据行 - 纯文本只读展示，信息靠左，列间标线
        html+='<tr class="order-child-row"><td colspan="19" style="padding:0;border:none;background:#fff"><div class="suborder-row" style="display:flex;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px">';
        html+='<span class="sub-col" data-col="subBn" style="flex:0 0 '+subColWidths.subBn+'px;padding-right:8px;box-sizing:border-box;overflow:visible;border-right:1px solid #cbd5e1;display:flex;flex-direction:column;justify-content:center"><div style="font-size:11px;line-height:1.3">'+esc(it.subBn||'')+'</div></span>';
        html+='<span class="sub-col" data-col="subOd" style="flex:0 0 '+subColWidths.subOd+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1;font-size:12px;color:#6b7280">'+esc(it.subOd||'-')+'</span>';
        html+='<span class="sub-col" data-col="bt" style="flex:0 0 '+subColWidths.bt+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-right:1px solid #cbd5e1;text-align:center"><span class="'+(BT_TAGS[it.bt]||'tag-gray')+'" style="font-size:11px">'+(BT_MAP[it.bt]||it.bt||'-')+'</span></span>';
        html+='<span class="sub-col" data-col="co" style="flex:0 0 '+subColWidths.co+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-right:1px solid #cbd5e1" title="'+esc(it.co||'')+'">'+esc(it.co||'')+'</span>';
        html+='<span class="sub-col" data-col="addr" style="flex:0 0 '+subColWidths.addr+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-right:1px solid #cbd5e1" title="'+esc(currentAddr)+'">'+esc(currentAddr)+'</span>';
        html+='<span class="sub-col" data-col="sd" style="flex:0 0 '+subColWidths.sd+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1">'+esc(it.sd||'')+'</span>';
        html+='<span class="sub-col" data-col="ed" style="flex:0 0 '+subColWidths.ed+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1">'+esc(it.ed||'')+'</span>';
        html+='<span class="sub-col" data-col="pr" style="flex:0 0 '+subColWidths.pr+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1">'+(it.pr||0)+'</span>';
        html+='<span class="sub-col" data-col="pd" style="flex:0 0 '+subColWidths.pd+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1">'+esc(it.pd||'')+'</span>';
        html+='<span class="sub-col" data-col="pa" style="flex:0 0 '+subColWidths.pa+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1">'+esc(it.pa||'')+'</span>';
        // 子订单收款：只计审批通过的 pr_records；有待审批时显示待审批标签
        var subPayRecs=it.pr_records||[];
        var subPayTotal=0,hasPayPendingAmt=false;
        if(subPayRecs.length>0){
          for(var spi=0;spi<subPayRecs.length;spi++){
            if(subPayRecs[spi].pf)subPayTotal+=(subPayRecs[spi].pm||0);
            if(!subPayRecs[spi].pf&&!subPayRecs[spi].prej&&subPayRecs[spi].pm>0)hasPayPendingAmt=true;
          }
        }else if(!it.pr_records){subPayTotal=(it.pm||0)}
        html+='<span class="sub-col" data-col="pm" style="flex:0 0 '+subColWidths.pm+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1">'+(hasPayPendingAmt?'<span class="tag-orange" style="font-size:10px">待审批</span>':fmtM(subPayTotal))+'</span>';
        // 支出账号：取已审批通过的支出记录中的账号（最后一条）
        var expAccountText='';
        var subExpRecs=it.xr||[];
        for(var sei=0;sei<subExpRecs.length;sei++){
          if(subExpRecs[sei].xf)expAccountText=esc(subExpRecs[sei].xa_actual||'');
        }
        html+='<span class="sub-col" data-col="xa" style="flex:0 0 '+subColWidths.xa+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1;font-size:12px;color:#6b7280">'+(expAccountText||'-')+'</span>';
        // 子订单支出：只计审批通过的 xr 记录；有待审批时显示待审批标签
        var subExpRecs=it.xr||[];
        var subExpTotal=0,hasExpPendingAmt=false;
        for(var sei=0;sei<subExpRecs.length;sei++){
          if(subExpRecs[sei].xf)subExpTotal+=(parseFloat(subExpRecs[sei].xm_actual||subExpRecs[sei].xm)||0);
          if(!subExpRecs[sei].xf&&!subExpRecs[sei].xrej&&subExpRecs[sei].xm>0)hasExpPendingAmt=true;
        }
        html+='<span class="sub-col" data-col="xm" style="flex:0 0 '+subColWidths.xm+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1" class="num-cost">'+(hasExpPendingAmt?'<span class="tag-orange" style="font-size:10px">待审批</span>':fmtM(subExpTotal))+'</span>';
        html+='<span class="sub-col" data-col="cost" style="flex:0 0 '+subColWidths.cost+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1">'+(it.cost||0)+'</span>';
        html+='<span class="sub-col" data-col="profit" style="flex:0 0 '+subColWidths.profit+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;border-right:1px solid #cbd5e1" class="num-profit">'+fmtM(subPayTotal-subExpTotal-(it.cost||0))+'</span>';
        html+='<span class="sub-col" data-col="rk" style="flex:0 0 '+subColWidths.rk+'px;padding-right:8px;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-right:1px solid #cbd5e1" title="'+esc(it.rk||'')+'">'+esc(it.rk||'')+'</span>';
        var editBtn='<button class="btn-edit" onclick="event.stopPropagation();editSubOrder('+o.id+','+j+')" style="padding:2px 6px;font-size:11px">编辑</button> ';
        var detailBtn='<button class="btn-secondary" onclick="event.stopPropagation();showItemDetail('+o.id+','+j+')" style="padding:2px 6px;font-size:11px">详情</button> ';
        html+='<span class="sub-col" data-col="action" style="flex:1 1 '+subColWidths.action+'px;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-align:left">'+editBtn+detailBtn+delBtn+'</span>';
        html+='</div></td></tr>';
      }
    }
  }
  tb.innerHTML=html||'<tr><td colspan="19" class="empty-state"><p>暂无订单</p></td></tr>';
  // 强制重排解决移动端 Safari 子订单 flex 布局不渲染的问题
  void tb.offsetHeight;
  setTimeout(function(){void(tb.offsetHeight);},100);
  buildPg($('orders-pagination'),Math.ceil(data.length/PS_ORD)||1,og,function(p){og=p;renderOrdersTable()});
  // 同步隐藏列和筛选指示器
  var oHiddenCols=_getOrderHiddenCols();
  // 隐藏列内容
  var oRows=tb.querySelectorAll('tr.order-parent-row');
  for(var ri=0;ri<oRows.length;ri++){
    for(var ci=1;ci<oRows[ri].cells.length;ci++){
      var td=oRows[ri].cells[ci];
      var ck=td.getAttribute('data-col');
      if(ck&&oHiddenCols.indexOf(ck)!==-1){td.style.display='none'}
      else{td.style.display=''}
    }
  }
  // 更新表头隐藏+指示器
  var oHeader=document.querySelector('#page-orders .data-table > thead > tr');
  if(oHeader){
    for(var ci=0;ci<oHeader.cells.length;ci++){
      var th=oHeader.cells[ci];
      // 把手
      if(!th.querySelector('.col-resizer')&&ci>0&&ci<oHeader.cells.length-1){
        var h=document.createElement('div');h.className='col-resizer';h.title='拖拽调整宽度';
        th.appendChild(h);
      }
      // 筛选指示器
      var col=th.getAttribute('data-col');
      if(col&&!th.querySelector('.fp-indicator')){
        var ind=document.createElement('span');ind.className='fp-indicator';
        th.appendChild(ind);
      }
      // 更新已有指示器的激活状态和排序状态
      if(col){
        var existing=th.querySelector('.fp-indicator');
        if(existing){
          var f=_orderFilters[col];
          if(f&&f.enabled&&Object.keys(f.vals).length>0)existing.classList.add('active');
          else existing.classList.remove('active');
          existing.classList.remove('sort-asc','sort-desc');
          if(_orderSort.col===col)existing.classList.add('sort-'+_orderSort.dir);
        }
      }
      // 隐藏列头
      if(col&&oHiddenCols.indexOf(col)!==-1){th.style.display='none'}
      else{th.style.display=''}
    }
  }
  }catch(e){console.error('【ERROR】renderOrdersTable:',e);}
}
function addBizForCustomer(ck){
  var o=null;
  for(var i=0;i<DB_ORDERS.length;i++){
    var bn=DB_ORDERS[i].bn||'';
    if(bn===ck){o=DB_ORDERS[i];break}
  }
  if(o){
    var prefill={nn:o.nn,wx:o.wx,ac:o.ac,ct:o.ct,sl:o.sl,nq:o.nq};
    openOrderModal(null,prefill);
  }else{
    openOrderModal(null,{nn:ck});
  }
}
// ---- 内联编辑 ----
function updateItemField(oid,idx,field,val){
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].id===oid){
      if(DB_ORDERS[i].items&&DB_ORDERS[i].items[idx]){
        var it=DB_ORDERS[i].items[idx];
        // pending（审批中）和approved状态不可编辑
        if(it.itemStatus==='pending'){
          toast('该订单正在审批中，审批完成前无法修改','error');
          return;
        }
        if(it.itemStatus==='approved'){
          toast('该订单已审批通过，无法修改','error');
          return;
        }
        // 当选择地址时，同步更新地址管理中的状态
        if(field==='addr'){
          var oldAddr=(it.addr||'').trim();
          var newAddr=(val||'').trim();
          // 验证新地址不能是已占用的（排除当前子订单已有的地址）
          if(newAddr && newAddr!==oldAddr && isAddrOccupied(newAddr, oldAddr)){
            toast('该地址已被占用，无法选择','error');
            renderOrdersTable();
            return;
          }
          var order=DB_ORDERS[i];
          // 旧地址释放：如果之前有地址关联，解除该地址的业务编号
          if(oldAddr){
            for(var ai=0;ai<DB_ADDRESS.length;ai++){
              var va=DB_ADDRESS[ai];
              var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
              if(fullAddr===oldAddr){
                // 如果这个地址之前是被这个子订单关联的，才解除
                if(va.bn===order.bn||va.bn===(order.nn||'')||va.bn==='已使用'){
                  va.bn=''; // 解除关联，恢复为空置
                  va.co='';va.nn='';va.sl=''; // 清除关联字段
                }
                break;
              }
            }
          }
          // 新地址占用：将地址的业务编号设置为父订单编号（这样地址就会显示为"已占用"）
          if(newAddr){
            for(var ai=0;ai<DB_ADDRESS.length;ai++){
              var va=DB_ADDRESS[ai];
              var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
              if(fullAddr===newAddr){
                // 用父订单的业务编号或客户昵称标记该地址为已占用
                va.bn=order.bn||order.nn||'已使用';
                // 同时更新地址管理中的一些关联字段
                if(!va.co)va.co=it.co||order.co||''; // 单位名称：优先用子订单的单位名称
                if(!va.nn)va.nn=order.nn||''; // 客户昵称
                if(!va.sl)va.sl=order.sl||''; // 业务员
                // 如果开始时间为空，自动设置为当天，并计算结束时间（满1年）
                if(!it.sd){
                  var today=todayStr();
                  it.sd=today;
                  // 计算结束时间：开始时间加1年后减1天
                  var sdParts=today.split('-');
                  var sYear=parseInt(sdParts[0]);
                  var sMonth=parseInt(sdParts[1])-1;
                  var sDay=parseInt(sdParts[2]);
                  var eDate=new Date(sYear+1,sMonth,sDay);
                  eDate.setDate(eDate.getDate()-1);
                  it.ed=eDate.getFullYear()+'-'+String(eDate.getMonth()+1).padStart(2,'0')+'-'+String(eDate.getDate()).padStart(2,'0');
                }
                va.startDate=it.sd;
                va.endDate=it.ed;
                break;
              }
            }
          }
        }
        // 当修改开始时间时，同步更新到地址管理，并自动设置结束时间为开始时间一年后减1天（满1年）
        if(field==='sd'&&val){
          var currentAddr=(it.addr||'').trim();
          var order=DB_ORDERS[i];
          if(currentAddr){
            for(var ai=0;ai<DB_ADDRESS.length;ai++){
              var va=DB_ADDRESS[ai];
              var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
              if(fullAddr===currentAddr){
                va.startDate=val;
                // 自动计算结束时间：开始时间加1年后减1天（满1年）
                // 例如：4月16日开始，结束时间是次年4月15日
                var sdParts=val.split('-');
                var year=parseInt(sdParts[0]);
                var month=parseInt(sdParts[1])-1;
                var day=parseInt(sdParts[2]);
                var endDate=new Date(year+1,month,day);
                endDate.setDate(endDate.getDate()-1); // 减1天
                var nextYear=endDate.getFullYear()+'-'+String(endDate.getMonth()+1).padStart(2,'0')+'-'+String(endDate.getDate()).padStart(2,'0');
                it.ed=nextYear; // 同时更新子订单的结束时间
                va.endDate=nextYear;
                break;
              }
            }
          }
        }
        // 当修改结束时间时，同步更新到地址管理
        if(field==='ed'&&val){
          var currentAddr=(it.addr||'').trim();
          if(currentAddr){
            for(var ai=0;ai<DB_ADDRESS.length;ai++){
              var va=DB_ADDRESS[ai];
              var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
              if(fullAddr===currentAddr){
                va.endDate=val;
                break;
              }
            }
          }
        }
        it[field]=val;
        // 重新计算收益：如果有收款金额用收款-支出-成本；否则用报价-支出-成本
        var pm=it.pm||0;
        var xm=it.xm||0;
        var cost=it.cost||0;
        if(pm>0){
          it.profit=pm-xm-cost;
        }else{
          it.profit=(it.pr||0)-xm-cost;
        }
        // 重新计算汇总
        sumOrder(DB_ORDERS[i]);
      }
      break;
    }
  }
  syncAll();
  renderOrdersTable();
  // 如果是地址字段变更，同步刷新地址管理表格
  if(field==='addr'){
    if(curPage==='address')renderAddressTable();
    // 手动触发一次地址表格刷新（确保即使不在地址页面，下次切换时数据也是新的）
    var origFn=renderAddressTable;
    // 暂时更新快照，让轮询可以检测到变化
  }
  toast('已更新');
}
function updateItemRemark(oid,idx,val){
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].id===oid){
      if(DB_ORDERS[i].items&&DB_ORDERS[i].items[idx]){
        var it=DB_ORDERS[i].items[idx];
        // pending和approved状态不可编辑
        if(it.itemStatus==='pending'){
          toast('该订单正在审批中，无法修改备注','error');
          return;
        }
        if(it.itemStatus==='approved'){
          toast('该订单已审批通过，无法修改备注','error');
          return;
        }
        it.rk=val;
      }
      break;
    }
  }
  syncAll();
  toast('备注已更新');
}

// 支出相关工具函数
function canModifyExpense(){
  // 支出相关操作需要非销售角色权限
  return curRole && curRole !== 'sales';
}

// ---- 审批流程 ----
function toggleAllItems(oid,checked){
  var cbs=document.querySelectorAll('.item-cb[data-oid="'+oid+'"]');
  for(var i=0;i<cbs.length;i++)cbs[i].checked=checked;
}
function getCheckedItems(oid){
  var cbs=document.querySelectorAll('.item-cb[data-oid="'+oid+'"]:checked');
  var idxs=[];
  for(var i=0;i<cbs.length;i++)idxs.push(parseInt(cbs[i].getAttribute('data-idx')));
  return idxs;
}
function submitOrder(id){
  var order=null;
  for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].id===id){order=DB_ORDERS[i];break}}
  if(!order)return;
  // 获取勾选的子订单索引
  var checkedIdxs=getCheckedItems(id);
  if(checkedIdxs.length===0){
    toast('请先勾选要提交的子订单','error');
    return;
  }
  // 校验勾选的子订单：1.必须有地址 2.必须有收款信息
  var noAddr=[],noPayment=[];
  for(var i=0;i<checkedIdxs.length;i++){
    var it=order.items[checkedIdxs[i]];
    if(!it.addr||it.addr.trim()===''){
      noAddr.push('第'+(checkedIdxs[i]+1)+'个子订单');
    }
    if(!it.pm||it.pm<=0||!it.pd){
      noPayment.push(it.addr||('第'+(checkedIdxs[i]+1)+'个地址'));
    }
  }
  if(noAddr.length>0){
    toast('以下子订单未选择地址：\n'+noAddr.join('、')+'\n\n请先为每个子订单选择地址后再提交审核','error');
    return;
  }
  if(noPayment.length>0){
    toast('以下地址缺少收款信息（收款金额或收款时间）：\n'+noPayment.join('、'),'error');
    return;
  }
  order.ap='pending';
  order.apTime=todayStr();
  order.apItems=checkedIdxs;
  for(var i=0;i<checkedIdxs.length;i++){
    order.items[checkedIdxs[i]].itemStatus='pending';
  }
  syncAll();
  toast('已提交'+checkedIdxs.length+'个子订单，等待审批');
  renderOrdersTable();
  updateApprovalBadge();
}
function approveOrder(id){
  confirmDialog('确认通过该订单审批？通过后将计入绩效。', function(){ doApprove(id); }, { title:'确认审批', okText:'确认通过', okClass:'btn-approve' });
}
function doApprove(id){
  // 关闭弹框
  document.querySelectorAll('.modal-overlay').forEach(function(m){if(m.id!=='modal-overlay')m.remove()});
  
  var orderToApprove=null;
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].id===id){
      orderToApprove=DB_ORDERS[i];
      break;
    }
  }
  if(!orderToApprove)return;

  // 将已提交的子订单标记为已通过（只处理pending状态的）
  if(orderToApprove.items){
    for(var j=0;j<orderToApprove.items.length;j++){
      if((orderToApprove.items[j].itemStatus||'')==='pending'){
        orderToApprove.items[j].itemStatus='approved';
        // 同步已通过的子订单数据到地址表
        syncSubOrderToAddress(orderToApprove.items[j], orderToApprove);
      }
    }
  }
  updateParentOrderStatus(orderToApprove);
  // 清空apItems数组
  orderToApprove.apItems=[];
  // 检查是否还有未完成的子订单
  var hasPending=false;
  if(orderToApprove.items){
    for(var k=0;k<orderToApprove.items.length;k++){
      var st=orderToApprove.items[k].itemStatus||'draft';
      if(st==='draft'||st==='pending'){hasPending=true;break;}
    }
  }
  // 只有所有子订单都处理完，母订单才变成approved
  if(!hasPending){
    orderToApprove.ap='approved';
    orderToApprove.approveTime=todayStr();
  }
  // 计入绩效
  var profit=orderToApprove.profit_total||0;
  if(window.DB_PERFORMANCE){
    DB_PERFORMANCE.push({
      id:Date.now(),
      sales:orderToApprove.sl||'',
      bn:orderToApprove.bn||'',
      profit:profit,
      date:todayStr(),
      orderId:id
    });
  }
  toast('审批通过，已计入绩效');
  syncAll();
  renderOrdersTable();
  updateApprovalBadge();
  if(document.getElementById('approval-content')&&document.getElementById('approval-content').style.display!=='none'){
    renderApprovalPage();
  }
}
function rejectOrder(id){
  // 打开驳回弹窗
  showRejectModal(id);
}
function showRejectModal(id){
  var overlay=document.createElement('div');overlay.className='modal-overlay active';
  overlay.style.display='flex';
  overlay.innerHTML='<div class="modal-box" style="max-width:450px"><div class="modal-header"><h3>驳回订单</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div><div class="modal-body"><p style="margin-bottom:10px;color:#666">请输入驳回原因，该原因将写入订单备注：</p><textarea id="reject-reason-input" rows="4" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:13px;resize:vertical" placeholder="请输入驳回原因..."></textarea></div><div class="modal-footer"><button class="btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">取消</button><button class="btn-reject" onclick="confirmReject('+id+')">确认驳回</button></div></div>';
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove()});
  document.body.appendChild(overlay);
  var ta=document.getElementById('reject-reason-input');
  if(ta){ta.focus();
    ta.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();var btn=overlay.querySelector('.btn-reject');if(btn)btn.click();}
      if(e.key==='Escape'){e.preventDefault();overlay.remove();}
    });
  }
}
function confirmReject(id){
  var reason=document.getElementById('reject-reason-input');
  if(!reason||!reason.value.trim()){toast('请输入驳回原因','error');return}
  var rsn=reason.value.trim();
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].id===id){
      DB_ORDERS[i].ap='rejected';
      DB_ORDERS[i].rejectTime=todayStr();
      DB_ORDERS[i].rejectReason=rsn;
      // 只更新被提交的子订单，并写入驳回原因
      if(DB_ORDERS[i].apItems){
        for(var j=0;j<DB_ORDERS[i].apItems.length;j++){
          var idx=DB_ORDERS[i].apItems[j];
          DB_ORDERS[i].items[idx].itemStatus='rejected';
          DB_ORDERS[i].items[idx].rk='【驳回:'+rsn+'】';
        }
      }
      toast('已驳回，原因已写入该子订单备注');
      break;
    }
  }
  document.querySelectorAll('.modal-overlay').forEach(function(m){if(m.id!=='modal-overlay')m.remove()});
  syncAll();
renderOrdersTable();
  if(curPage==='approval')renderApprovalPage();
  updateApprovalBadge();
}

// 确认支出审批
function approveExpense(oid,idx,recIdx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items||!o.items[idx]){toast('数据异常','error');return;}
  var it=o.items[idx];
  var rec=it.xr&&it.xr[recIdx];
  if(!rec){toast('支出记录异常','error');return;}

  // 获取当前时间，精确到分
  var now=new Date();
  var y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,'0'),d=String(now.getDate()).padStart(2,'0');
  var h=String(now.getHours()).padStart(2,'0'),min=String(now.getMinutes()).padStart(2,'0');
  var nowStr=y+'-'+m+'-'+d+' '+h+':'+min;

  var methodMap={wechat:'微信二维码',alipay_qr:'支付宝二维码',alipay_account:'支付宝账号',bank:'对公账号'};
  var methodName=methodMap[rec.xp]||'系统';
  var payDetail={};
  try{payDetail=rec.xb?JSON.parse(rec.xb):{};}catch(e){payDetail={};}
  var defaultAccount='';
  if(rec.xp==='alipay_account'){
    defaultAccount=(payDetail.alipayName||'')+' '+(payDetail.alipayAccount||'');
  }else if(rec.xp==='bank'){
    defaultAccount=(payDetail.bankHolder||'')+' '+(payDetail.bankAccount||'');
  }else{
    defaultAccount='';
  }

  var body='<form id="exp-approve-form"><div class="form-grid">'
    +'<div class="form-group"><label>支出时间</label><input type="datetime-local" name="xf_time" value="'+nowStr.replace(' ','T')+'" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px"/></div>'
    +'<div class="form-group"><label>支出账号</label>'+buildExpAccountOpts(o.sl,defaultAccount,'xa_actual')+'</div>'
    +'<div class="form-group"><label>支出金额</label><input type="number" name="xm_actual" value="'+(rec.xm||0)+'" placeholder="请输入金额" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:4px"/></div>'
    +'<div class="form-group"><label>支付方式</label><span style="display:inline-block;padding:6px 0;color:#374151;font-weight:500">'+methodName+'</span></div>'
    +'</div>';
  body+='<div style="margin-top:12px"><label style="font-size:13px;color:#374151;font-weight:500;display:block;margin-bottom:6px">上传审批凭证</label><input type="file" id="exp-replace-img" accept="image/*" multiple onchange="previewExpImg(this)" style="font-size:13px"/><div id="exp-img-preview-replace" style="display:none;margin-top:8px"></div></div>';
  body+='</form>';
  showModal('确认支出',body,function(){
    var f=getFormData('exp-approve-form');
    if(!f.xa_actual){toast('请输入支出账号','error');return}
    if(!f.xm_actual||f.xm_actual<=0){toast('请输入有效金额','error');return}

    // 更新支出记录
    rec.xf=f.xf_time.replace('T',' ');
    rec.xa_actual=f.xa_actual;
    rec.xm_actual=parseFloat(f.xm_actual);
    rec.xf_user=curUser.name;

    // 审批人上传凭证（保留申请人截图不变）
    var pendingExps=_pendingImgFiles['exp-replace-img']||[];
    if(pendingExps.length){
      var me=this;
      uploadMultipleImages(pendingExps).then(function(urls){
        rec.xi_voucher=makeImgUrls(urls);
        delete _pendingImgFiles['exp-replace-img'];
        finishExpenseApprove();
      }).catch(function(e){
        console.error('图片上传失败:',e);
        finishExpenseApprove();
      });
    }else{
      finishExpenseApprove();
    }

    function finishExpenseApprove(){
      // 更新子订单的支出金额（累加确认的金额）
      it.xm=(it.xm||0);
      it.xd=rec.xd; // 保留申请时间
      it.xp=rec.xp; // 保留支付方式
      // 重新计算收益
      var pm=it.pm||0;
      var cost=it.cost||0;
      // 重新计算xr中所有已确认的支出总额
      var confirmedTotal=0;
      for(var ri=0;ri<(it.xr||[]).length;ri++){
        var r=it.xr[ri];
        if(r.xf)confirmedTotal+=(r.xm_actual||r.xm||0);
      }
      it.xm=confirmedTotal;
      it.profit=pm-it.xm-cost;
      sumOrder(o);

      // 同时在财务支出页面添加一条记录（从xr记录生成）
      var expRecord={
        id:Date.now(),
        expDate:rec.xf||todayStr(),
        bizNo:o.bn,
        sales:o.sl||'',
        company:it.co||o.co||'',
        expMethod:rec.xp,
        expDetail:rec.xb,
        expAccount:f.xa_actual,
        expTarget:methodName,
        expAmount:parseFloat(f.xm_actual),
        cost:it.cost||0,
        payAccount:it.pa||'',
        payAmount:it.pm||0,
        bizType:o.bt||'地址销售',
        remark:'子订单支出 - '+esc(it.addr||''),
        img:rec.xi||'',
        orderId:o.id,
        itemIdx:idx,
        status:'confirmed'
      };
      // 存储到全局支出记录（用于财务支出页面）
      if(!window.EXP_RECORDS)window.EXP_RECORDS=[];
      // 检查是否已存在
      var existIdx=-1;
      for(var ei=0;ei<window.EXP_RECORDS.length;ei++){
        if(window.EXP_RECORDS[ei].orderId===o.id&&window.EXP_RECORDS[ei].itemIdx===idx&&window.EXP_RECORDS[ei].recIdx===recIdx){
          existIdx=ei;break;
        }
      }
      if(existIdx>=0){
        window.EXP_RECORDS[existIdx]=expRecord;
      }else{
        window.EXP_RECORDS.push(expRecord);
      }

      syncAll();
      toast('支出已确认');
      closeAllModals();
      renderApprovalPage();
      renderOrdersTable();
      renderExpensesTable();
    }
  });
}

// 驳回支出
function rejectExpense(oid,idx,recIdx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items||!o.items[idx]){toast('数据异常','error');return;}
  var it=o.items[idx];
  var rec=it.xr&&it.xr[recIdx];
  if(!rec){toast('支出记录异常','error');return;}

  var overlay=document.createElement('div');overlay.className='modal-overlay active';
  overlay.style.display='flex';
  overlay.innerHTML='<div class="modal-box" style="max-width:450px"><div class="modal-header"><h3>驳回支出</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button></div><div class="modal-body"><p style="margin-bottom:10px;color:#666">请输入驳回原因：</p><textarea id="reject-exp-reason" rows="4" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:13px;resize:vertical" placeholder="请输入驳回原因..."></textarea></div><div class="modal-footer"><button class="btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">取消</button><button class="btn-reject" onclick="confirmRejectExpense('+oid+','+idx+','+recIdx+')">确认驳回</button></div></div>';
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove()});
  document.body.appendChild(overlay);
  var ta=document.getElementById('reject-exp-reason');
  if(ta){ta.focus();
    ta.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();var btn=overlay.querySelector('.btn-reject');if(btn)btn.click();}
      if(e.key==='Escape'){e.preventDefault();overlay.remove();}
    });
  }
}

function confirmRejectExpense(oid,idx,recIdx){
  var reason=document.getElementById('reject-exp-reason');
  if(!reason||!reason.value.trim()){toast('请输入驳回原因','error');return}
  var rsn=reason.value.trim();
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items||!o.items[idx]){toast('数据异常','error');return;}
  var it=o.items[idx];
  var rec=it.xr&&it.xr[recIdx];
  if(!rec){toast('支出记录异常','error');return;}

  rec.xrej=rsn;
  // 如果该记录已被确认（已通过），同时清除确认信息
  if(rec.xf){rec.xf='';rec.xf_time='';rec.xm_actual='';rec.xa_actual='';rec.xi='';}
  rec.xrejTime=todayStr();
  rec.xrej_user=curUser.name;
  syncAll();
  toast('支出已驳回');
  closeAllModals();
  renderApprovalPage();
  renderOrdersTable();
}
function switchStatusTab(btn,status){
  approvalFilter=status;
  var cards=document.querySelectorAll('.approval-stat-cards .stat-card');
  for(var i=0;i<cards.length;i++){
    cards[i].classList.toggle('card-active',cards[i].getAttribute('data-appr-status')===status);
  }
  renderApprovalPage();
}
function onApprTypeChange(){
  _apprType=document.getElementById('appr-type-select').value;
  renderApprovalPage();
}
function updateApprovalBadge(){
  // 统计待审批的支出记录（按batchId分组计数，一组算1个）
  var expBatchSet={};
  var expBatchOrder=[];
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(o.items){
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        var records=it.xr||[];
        for(var k=0;k<records.length;k++){
          var rec=records[k];
          if(!rec.xf&&!rec.xrej){
            var bid=rec.batchId||('__noBatch_'+o.id+'_'+j+'_'+k);
            if(!expBatchSet[bid]){
              expBatchSet[bid]=true;
              expBatchOrder.push(bid);
            }
          }
        }
      }
    }
  }
  var expPendingCount=expBatchOrder.length;
  // 统计待审批的收款记录（按batchId分组计数，一组算1个）
  var payBatchSet={};
  var payBatchOrder=[];
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    // 母订单收款
    if(o.pr){
      for(var j=0;j<o.pr.length;j++){
        var rec=o.pr[j];
        if(!rec.pf&&!rec.prej){
          var bid=rec.batchId||('__noBatch_'+o.id+'_parent_'+j);
          if(!payBatchSet[bid]){
            payBatchSet[bid]=true;
            payBatchOrder.push(bid);
          }
        }
      }
    }
    // 子订单收款
    if(o.items){
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        var payArr=it.pr_records||it.pr||[];
        if(payArr.length>0){
          for(var k=0;k<payArr.length;k++){
            var rec=payArr[k];
            if(!rec.pf&&!rec.prej){
              var bid=rec.batchId||('__noBatch_'+o.id+'_'+j+'_'+k);
              if(!payBatchSet[bid]){
                payBatchSet[bid]=true;
                payBatchOrder.push(bid);
              }
            }
          }
        }
      }
    }
  }
  var payPendingCount=payBatchOrder.length;
  // 统计已审批/已驳回（同逻辑计算总数用于展示）
  var expDoneCount=0,expRejCount=0;
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(o.items){
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        var records=it.xr||[];
        for(var k=0;k<records.length;k++){
          var rec=records[k];
          if(rec.xf)expDoneCount++;
          else if(rec.xrej)expRejCount++;
        }
      }
    }
  }
  var payDoneCount=0,payRejCount=0;
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(o.pr){for(var j=0;j<o.pr.length;j++){var rec=o.pr[j];if(rec.pf)payDoneCount++;else if(rec.prej)payRejCount++;}}
    if(o.items){
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        var payArr=it.pr_records||it.pr||[];
        for(var k=0;k<payArr.length;k++){var rec=payArr[k];if(rec.pf)payDoneCount++;else if(rec.prej)payRejCount++;}
      }
    }
  }
  // 开票统计
  var invPendingCount=0,invDoneCount=0,invRejCount=0;
  for(var i=0;i<DB_INVOICES.length;i++){
    var s=DB_INVOICES[i].status;
    if(s==='pending')invPendingCount++;
    else if(s==='approved')invDoneCount++;
    else if(s==='rejected')invRejCount++;
  }
  var totalPending=payPendingCount+expPendingCount+invPendingCount;
  var totalDone=payDoneCount+expDoneCount+invDoneCount;
  var totalRejected=payRejCount+expRejCount+invRejCount;
  // 侧边栏红点 = 待审批总数
  var badge=document.getElementById('approval-badge');
  if(badge){
    badge.textContent=totalPending;
    badge.style.display=totalPending>0?'inline':'none';
  }
  // 更新3个状态卡数量
  var p1=$('appr-pending-count');if(p1)p1.textContent=totalPending;
  var p2=$('appr-done-count');if(p2)p2.textContent=totalDone;
  var p3=$('appr-rejected-count');if(p3)p3.textContent=totalRejected;
}
function renderApprovalPage(){
  updateApprovalBadge();
  var container=document.getElementById("approval-content");
  var _st=approvalFilter;
  var _showExp=(_apprType==="all"||_apprType==="exp");
  var _showPay=(_apprType==="all"||_apprType==="pay");
  var _showInv=(_apprType==="all"||_apprType==="inv");
  var parts=[];

  // ====== 支出审批 ======
  if(_showExp){
    var expCards=[];
    for(var i=0;i<DB_ORDERS.length;i++){
      var o=DB_ORDERS[i];
      if(!o.items)continue;
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        var records=it.xr||[];
        for(var k=0;k<records.length;k++){
          var rec=records[k];
          var isPending=!rec.xf&&!rec.xrej;
          var isDone=!!rec.xf;
          var isRejected=!!rec.xrej;
          if((_st==="pending"&&isPending)||(_st==="done"&&isDone)||(_st==="rejected"&&isRejected)){
            expCards.push({o:o,it:it,rec:rec,idx:j,recIdx:k});
          }
        }
      }
    }
    if(expCards.length>0){
      expCards.reverse();
      var methodMap={wechat:"微信二维码",alipay_qr:"支付宝二维码",alipay_account:"支付宝账号",bank:"对公账号"};
      var expBatchGroups={},expBatchOrder=[];
      for(var gi=0;gi<expCards.length;gi++){
        var ec=expCards[gi];
        var bid=ec.rec.batchId||("__noBatch_"+ec.o.id+"_"+ec.idx+"_"+ec.recIdx);
        if(!expBatchGroups[bid]){expBatchGroups[bid]=[];expBatchOrder.push(bid);}
        expBatchGroups[bid].push(ec);
      }
      var h='<h3 style="font-size:14px;margin:0 0 8px;padding:0 4px;color:#6b7280">\u{1F4CB} 支出申请</h3><div class="approval-list">';
      for(var g=0;g<expBatchOrder.length;g++){
        var bid=expBatchOrder[g],grp=expBatchGroups[bid];
        var firstCard=grp[0],o=firstCard.o,it=firstCard.it,rec=firstCard.rec;
        var isMulti=grp.length>1;
        var payDetail={};
        try{payDetail=rec.xb?JSON.parse(rec.xb):{};}catch(e){}
        var accountText="";
        if(rec.xp==="alipay_account") accountText=(payDetail.alipayAccount||"")+" "+(payDetail.alipayName||"");
        else if(rec.xp==="bank") accountText=(payDetail.bankName||"")+" "+(payDetail.bankAccount||"");
        else accountText=rec.xa||"系统默认";
        var statusText=rec.xf?"已确认":rec.xrej?"已驳回":"待确认";
        var statusCls=rec.xf?"green":rec.xrej?"red":"orange";
        var totalAmt=0;
        for(var ta=0;ta<grp.length;ta++) totalAmt+=(grp[ta].rec.xm||0);
        totalAmt=Math.round(totalAmt*100)/100;
        h+='<div class="approval-card'+(rec.xrej?' card-rejected':'')+'">'
          +'<div class="card-header"><div class="card-title"><span class="order-bn-tag">'+esc(o.bn)+'</span>'+(rec.expNo?'<span class="biz-count-tag" style="background:#dbeafe;color:#1d4ed8">'+esc(rec.expNo)+'</span>':'')+(isMulti?'<span class="biz-count-tag" style="background:#ede9fe;color:#6d28d9">批量'+grp.length+'单</span>':'')+'<span class="biz-count-tag">'+esc(it.co||'-')+'</span><span class="tag-'+statusCls+'">'+statusText+'</span></div>'
          +'<div class="card-meta">客户：'+esc(o.nn||'-')+' | 业务员：'+esc(o.sl||'-')+'</div></div>';
        if(isMulti){
          h+='<div style="padding:8px 16px;background:#fafafa;font-size:12px;border-bottom:1px solid #f0f0f0"><div style="font-weight:600;margin-bottom:6px">子订单明细：</div>';
          for(var si=0;si<grp.length;si++){var sc=grp[si];h+='<div style="padding:6px 8px;margin-bottom:4px;background:#fff;border:1px solid #e8eaed;border-radius:6px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><span style="font-weight:600;font-size:13px">'+esc(sc.it.subBn||('子'+sc.idx))+'</span><span style="color:#d97706;font-weight:600">¥'+(sc.rec.xm||0).toFixed(2)+'</span></div><div style="color:#4b5563;line-height:1.6"><span>单位：<b>'+esc(sc.it.co||'-')+'</b></span><span style="margin-left:10px">地址：<b>'+esc(sc.it.addr||'-')+'</b></span><br><span>注册类型：'+esc(sc.it.rt||'-')+'</span><span style="margin-left:10px">联系电话：'+esc(sc.it.ph||'-')+'</span><span style="margin-left:10px">法人：'+esc(sc.it.lp||'-')+'</span><span style="margin-left:10px">报价：¥'+(sc.it.pr||0).toFixed(2)+'</span></div></div>';}
          h+='</div>';
        }else{
          h+='<div class="card-meta">子订单：'+esc(it.subBn||('子'+firstCard.idx))+'</div>';
          h+='<div class="card-meta">单位：<b>'+esc(it.co||'-')+'</b></div>';
          h+='<div class="card-meta">地址：'+esc(it.addr||'-')+'</div>';
          if(it.rt)h+='<div class="card-meta">注册类型：'+esc(it.rt)+'</div>';
          if(it.ph)h+='<div class="card-meta">联系电话：'+esc(it.ph)+'</div>';
          if(it.lp)h+='<div class="card-meta">法人：'+esc(it.lp)+'</div>';
          if(it.pr)h+='<div class="card-meta">报价：<b class="num-cost">'+fmtM(it.pr)+'</b></div>';
        }
        if(rec.xd)h+='<div class="card-meta" style="color:#999">申请时间：'+esc(rec.xd)+'</div>';
        h+='<div class="card-summary" style="background:#fff7e6"><span>支出对象：<b>'+methodMap[rec.xp]+'</b></span><span>申请金额：<b class="num-cost">'+(isMulti?'¥'+totalAmt.toFixed(2):fmtM(rec.xm||0))+'</b></span><span>支出账号：<b>'+esc(accountText)+'</b></span>'+(rec.xi&&rec.xi.trim()!==''?'<span>申请截图：'+renderImgThumbs(rec.xi,'width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;margin:1px;')+'</span>':'')+(rec.rk?'<span>备注：<b style="color:#6b7280">'+esc(rec.rk)+'</b></span>':'')+'</div>';
        if(rec.xf)h+='<div class="card-summary" style="background:#f6ffed"><span>确认时间：<b>'+esc(rec.xf||'')+'</b></span><span>确认金额：<b class="num-cost">'+fmtM(rec.xm_actual||rec.xm||0)+'</b></span><span>支出账号：<b>'+esc(rec.xa_actual||'')+'</b></span>'+(rec.xf_user?'<span>审批人：<b>'+esc(rec.xf_user)+'</b></span>':'')+(rec.xi_voucher&&rec.xi_voucher.trim()!==''?'<span>审批凭证：'+renderImgThumbs(rec.xi_voucher,'width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;margin:1px;')+'</span>':'')+(rec.xf_rk?'<span>确认备注：<b style="color:#6b7280">'+esc(rec.xf_rk)+'</b></span>':'')+'</div>';
        if(rec.xrej)h+='<div class="card-reject-reason"><b>驳回原因：</b>'+esc(rec.xrej)+'</div>';
        var canApprove=!rec.xf&&!rec.xrej&&(curRole==='finance'||curRole==='gm'||curRole==='admin');
        if(canApprove){
          h+='<div class="card-actions">';
          if(isMulti){
            h+='<button class="btn-approve" onclick="approveExpBatch('+"'"+bid+"',"+o.id+')" style="margin:2px">确认支出（需上传截图）</button>';
            h+='<button class="btn-reject" onclick="rejectExpBatch('+"'"+bid+"',"+o.id+')">驳回</button>';
          }else{
            h+='<button class="btn-approve" onclick="approveExpense('+o.id+","+firstCard.idx+","+firstCard.recIdx+')" style="margin:2px">确认支出（需上传截图）</button>';
            h+='<button class="btn-reject" onclick="rejectExpense('+o.id+","+firstCard.idx+","+firstCard.recIdx+')">驳回</button>';
          }
          h+='</div>';
        }
        var canRejectDoneExp=rec.xf&&!rec.xrej&&(curRole==='admin'||curRole==='finance');
        if(canRejectDoneExp){
          h+='<div class="card-actions">';
          if(isMulti){
            h+='<button class="btn-reject" onclick="rejectDoneExpBatch('+"'"+bid+"',"+o.id+')">驳回（已通过）</button>';
          }else{
            h+='<button class="btn-reject" onclick="rejectExpense('+o.id+","+firstCard.idx+","+firstCard.recIdx+')">驳回（已通过）</button>';
          }
          h+='</div>';
        }
        if(curRole==='admin'||curRole==='finance'||curRole==='gm'){
          h+='<div class="card-actions"><button class="btn-danger" onclick="deleteExpRecordByBatch('+"'"+bid+"',"+o.id+')" style="margin:2px">删除此批支出记录</button></div>';
        }
        h+='</div>';
      }
      h+='</div>';
      parts.push(h);
    }
  }

  // ====== 收款审批 ======
  if(_showPay){
    var payCards=[];
    for(var i=0;i<DB_ORDERS.length;i++){
      var o=DB_ORDERS[i];
      if(o.pr){for(var j=0;j<o.pr.length;j++){var rec=o.pr[j];var isPending=!rec.pf&&!rec.prej;var isDone=!!rec.pf;var isRejected=!!rec.prej;if((_st==="pending"&&isPending)||(_st==="done"&&isDone)||(_st==="rejected"&&isRejected)){payCards.push({o:o,it:null,rec:rec,idx:-1,recIdx:j});}}}
      if(o.items){for(var j=0;j<o.items.length;j++){var it=o.items[j];var payArr=it.pr_records||it.pr||[];for(var k=0;k<payArr.length;k++){var rec=payArr[k];var isPending=!rec.pf&&!rec.prej;var isDone=!!rec.pf;var isRejected=!!rec.prej;if((_st==="pending"&&isPending)||(_st==="done"&&isDone)||(_st==="rejected"&&isRejected)){payCards.push({o:o,it:it,rec:rec,idx:j,recIdx:k});}}}}
    }
    if(payCards.length>0){
      payCards.reverse();
      var batchGroups={},batchOrder=[];
      for(var gi=0;gi<payCards.length;gi++){var card=payCards[gi];var bid=card.rec.batchId||("__noBatch_"+card.o.id+"_"+card.idx+"_"+card.recIdx);if(!batchGroups[bid]){batchGroups[bid]=[];batchOrder.push(bid);}batchGroups[bid].push(card);}
      var h='<h3 style="font-size:14px;margin:16px 0 8px;padding:0 4px;color:#6b7280">\u{1F4B0} 收款申请</h3><div class="approval-list">';
      for(var g=0;g<batchOrder.length;g++){
        var bid=batchOrder[g],grp=batchGroups[bid],firstCard=grp[0],o=firstCard.o,firstRec=firstCard.rec;
        var isMulti=grp.length>1;
        var totalAmt=0;for(var ta=0;ta<grp.length;ta++) totalAmt+=(grp[ta].rec.pm||0);totalAmt=Math.round(totalAmt*100)/100;
        var payDetail={};try{payDetail=firstRec.pxb?JSON.parse(firstRec.pxb):{};}catch(e){}
        var accountText=firstRec.ppa||"-";
        if(firstRec.ppm==="alipay_account") accountText=(payDetail.alipayAccount||"")+" "+(payDetail.alipayName||"");
        else if(firstRec.ppm==="bank") accountText=(payDetail.bankName||"")+" "+(payDetail.bankAccount||"");
        var statusText=firstRec.pf?"已确认":firstRec.prej?"已驳回":"待确认";
        var statusCls=firstRec.pf?"green":firstRec.prej?"red":"orange";
        h+='<div class="approval-card'+(firstRec.prej?' card-rejected':'')+'">'
          +'<div class="card-header"><div class="card-title"><span class="order-bn-tag">'+esc(o.bn)+'</span>'+(firstRec.payNo?'<span class="biz-count-tag" style="background:#dbeafe;color:#1d4ed8">'+esc(firstRec.payNo)+'</span>':'')+(isMulti?'<span class="biz-count-tag" style="background:#ede9fe;color:#6d28d9">批量'+grp.length+'单</span>':'')+(!isMulti&&firstCard.it?'<span class="biz-count-tag">'+esc(firstCard.it.co||'-')+'</span>':'')+'<span class="tag-'+statusCls+'">'+statusText+'</span></div>'
          +'<div class="card-meta">客户：'+esc(o.nn||'-')+' | 业务员：'+esc(o.sl||'-')+'</div></div>';
        if(isMulti){
          h+='<div style="padding:8px 16px;background:#fafafa;font-size:12px;border-bottom:1px solid #f0f0f0"><div style="font-weight:600;margin-bottom:6px">子订单明细：</div>';
          for(var si=0;si<grp.length;si++){var sc=grp[si];h+='<div style="padding:6px 8px;margin-bottom:4px;background:#fff;border:1px solid #e8eaed;border-radius:6px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:600;font-size:13px">'+esc(sc.it?sc.it.subBn||('子'+sc.idx):'母订单')+'</span><span style="color:#059669;font-weight:600">¥'+(sc.rec.pm||0).toFixed(2)+'</span></div><div style="color:#4b5563;line-height:1.6"><span>单位：<b>'+esc((sc.it&&sc.it.co)||(sc.o&&sc.o.co)||'-')+'</b></span><span style="margin-left:10px">地址：<b>'+esc((sc.it&&sc.it.addr)||'-')+'</b></span><br><span>注册类型：'+esc((sc.it&&sc.it.rt)||'-')+'</span><span style="margin-left:10px">联系电话：'+esc((sc.it&&sc.it.ph)||'-')+'</span><span style="margin-left:10px">法人：'+esc((sc.it&&sc.it.lp)||'-')+'</span><span style="margin-left:10px">报价：¥'+((sc.it&&sc.it.pr)||0).toFixed(2)+'</span></div></div>';}
          h+='</div>';
        }else if(firstCard.it){
          if(firstCard.it.subBn)h+='<div class="card-meta">子订单：'+esc(firstCard.it.subBn)+'</div>';
          if(firstCard.it.co)h+='<div class="card-meta">单位：<b>'+esc(firstCard.it.co)+'</b></div>';
          h+='<div class="card-meta">地址：'+esc(firstCard.it.addr||'-')+'</div>';
          if(firstCard.it.rt)h+='<div class="card-meta">注册类型：'+esc(firstCard.it.rt)+'</div>';
          if(firstCard.it.ph)h+='<div class="card-meta">联系电话：'+esc(firstCard.it.ph)+'</div>';
          if(firstCard.it.lp)h+='<div class="card-meta">法人：'+esc(firstCard.it.lp)+'</div>';
          if(firstCard.it.pr)h+='<div class="card-meta">报价：<b class="num-income">'+fmtM(firstCard.it.pr)+'</b></div>';
        }
        if(!isMulti&&firstRec.pd)h+='<div class="card-meta" style="color:#999">收款时间：'+esc(firstRec.pd)+'</div>';
        h+='<div class="card-summary" style="background:#f6ffed"><span>收款方式：<b>'+PAY_METHOD_MAP[firstRec.ppm]+'</b></span>'+(isMulti?'<span>总金额：<b class="num-income">'+fmtM(totalAmt)+'</b></span>':'<span>申请金额：<b class="num-income">'+fmtM(firstRec.pm||0)+'</b></span>')+'<span>收款账号：<b>'+esc(accountText)+'</b></span>'+(firstRec.pxi&&firstRec.pxi.trim()!==''?'<span>截图：'+renderImgThumbs(firstRec.pxi,'width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;margin:1px;')+'</span>':'')+'</div>';
        if(firstRec.pf)h+='<div class="card-summary" style="background:#e6f7ff"><span>确认时间：<b>'+esc(firstRec.pf_actual||'')+'</b></span><span>确认金额：<b class="num-income">'+fmtM(firstRec.pf_amount||firstRec.pm||0)+'</b></span><span>确认账号：<b>'+esc(firstRec.pf_account||'')+'</b></span>'+(firstRec.pf_user?'<span>审批人：<b>'+esc(firstRec.pf_user)+'</b></span>':'')+(firstRec.pf_rk?'<span>确认备注：<b style="color:#6b7280">'+esc(firstRec.pf_rk)+'</b></span>':'')+'</div>';
        if(firstRec.prej)h+='<div class="card-reject-reason"><b>驳回原因：</b>'+esc(firstRec.prej)+'</div>';
        var canApprove=!firstRec.pf&&!firstRec.prej&&(curRole==='finance'||curRole==='gm'||curRole==='admin');
        var canWithdraw=!firstRec.pf&&!firstRec.prej&&curUser&&o.sl===curUser.name;
        h+='<div class="card-actions">';
        if(canApprove){
          h+='<button class="btn-approve" onclick="approvePayBatch('+"'"+bid+"',"+o.id+')" style="background:#10b981">确认收款</button>';
          h+='<button class="btn-reject" onclick="rejectPayBatch('+"'"+bid+"',"+o.id+')">驳回</button>';
        }
        if(canWithdraw) h+='<button class="btn-secondary" onclick="withdrawPayBatch('+"'"+bid+"',"+o.id+')">撤回</button>';
        if(firstRec.pf&&!firstRec.prej&&(curRole==='admin'||curRole==='finance')) h+='<button class="btn-reject" onclick="rejectDonePayBatch('+"'"+bid+"',"+o.id+')" style="margin-left:4px">驳回（已通过）</button>';
        if(curRole==='admin'||curRole==='finance'||curRole==='gm') h+='<button class="btn-danger" onclick="deletePayRecordByBatch('+"'"+bid+"',"+o.id+')" style="margin-left:4px">删除</button>';
        h+='</div></div>';
      }
      h+='</div>';
      parts.push(h);
    }
  }

  // ====== 开票审批 ======
  if(_showInv){
    var filtered=[];
    for(var i=0;i<DB_INVOICES.length;i++){
      var r=DB_INVOICES[i];
      var isPend=r.status==="pending";
      var isDone=r.status==="approved";
      var isRej=r.status==="rejected";
      if((_st==="pending"&&isPend)||(_st==="done"&&isDone)||(_st==="rejected"&&isRej)) filtered.push(r);
    }
    if(filtered.length>0){
      filtered.reverse();
      var h='<h3 style="font-size:14px;margin:16px 0 8px;padding:0 4px;color:#6b7280">\u2601\uFE0F 开票申请</h3><div class="approval-list">';
      for(var g=0;g<filtered.length;g++){
        var r=filtered[g];
        var statusText=r.status==="approved"?"\u2705 已开票":r.status==="rejected"?"\u274C 已驳回":"\u23F3 待审批";
        var statusCls=r.status==="approved"?"tag-green":r.status==="rejected"?"tag-red":"tag-orange";
        // 计算关联订单的收款总额
        var orderTotalPay=0;
        for(var oi=0;oi<DB_ORDERS.length;oi++){
          if(DB_ORDERS[oi].bn===r.bn){
            var ord=DB_ORDERS[oi];
            if(ord.pr){for(var pj=0;pj<ord.pr.length;pj++){var prec=ord.pr[pj];if(prec.pf&&!prec.prej)orderTotalPay+=(prec.pm||0);}}
            if(ord.items){for(var ij=0;ij<ord.items.length;ij++){var it=ord.items[ij];var recs=it.pr_records||[];for(var pk=0;pk<recs.length;pk++){var rec=recs[pk];if(rec.pf&&!rec.prej)orderTotalPay+=(rec.pm||0);}}}
            break;
          }
        }
        h+='<div class="approval-card'+(r.status==='rejected'?' card-rejected':'')+'">'
          +'<div class="card-header"><div class="card-title"><span class="order-bn-tag">'+esc(r.bn||'')+'</span><span class="biz-count-tag" style="background:#dbeafe;color:#1d4ed8">'+esc(r.invType||'')+'</span><span class="tag-'+statusCls+'">'+statusText+'</span></div>'
          +'<div class="card-meta">申请人：'+esc(r.appliedBy||'-')+' | 申请时间：'+esc(r.appliedAt||'')+'</div></div>'
          +'<div class="card-summary" style="background:#f5f3ff">'
          +'<span>业务员：<b>'+esc(r.salesperson||'-')+'</b></span>'
          +'<span>客户昵称：<b>'+esc(r.nick||'-')+'</b></span>'
          +'<span>受票方：<b>'+esc(r.title||'-')+'</b></span>'
          +'<span>开票类目：'+esc(r.category||'-')+'</span>'
          +'<span>优先级：<b style="color:'+(r.priority==='加急'?'#dc2626':'#6b7280')+'">'+(r.priority||'普通')+'</b></span>'
          +'<span>金额：<b class="num-income">'+fmtM(r.amount||0)+'</b></span>'
          +'<span>我方开票单位：'+esc(r.ourUnit||'-')+'</span>'
          +'<span>订单已收款：<b class="num-income">'+fmtM(orderTotalPay)+'</b></span>';
        if(r.taxId)h+='<span>税号：'+esc(r.taxId)+'</span>';
        if(r.rk)h+='<span>备注：<b style="color:#6b7280">'+esc(r.rk)+'</b></span>';
        h+='</div>';
        // 开票文件：已上传则显示下载，待审批则显示上传
        if(r.invFile){
          h+='<div class="card-summary" style="background:#e6f7ff"><span>📄 开票文件：<a href="'+esc(r.invFile)+'" target="_blank" style="color:#3b82f6;text-decoration:underline" download>点击下载</a></span></div>';
        }
        if(r.status==='rejected') h+='<div class="card-summary" style="background:#e6f7ff"><span>驳回人：<b>'+esc(r.approvedBy||'')+'</b></span><span>时间：'+esc(r.approvedAt||'')+'</span></div>';
        var canApprove=r.status==='pending'&&(curRole==='admin'||curRole==='finance'||curRole==='gm');
        h+='<div class="card-actions" style="display:flex;gap:4px;align-items:center">';
        if(canApprove){h+='<button class="btn-approve" onclick="approveInvoice('+r.id+')" style="background:#10b981;margin:0">确认开票</button><button class="btn-reject" onclick="rejectInvoice('+r.id+')" style="margin:0">驳回</button>';}
        if(r.status==='pending'&&r.appliedBy===curUser.name) h+='<button class="btn-danger" onclick="withdrawInvoice('+r.id+')" style="margin:0">撤回</button>';
        // 已开票：上传或下载发票文件
        if(r.status==='approved'){
          if(r.appliedBy===curUser.name||curRole==='admin'||curRole==='finance'||curRole==='gm'){
            if(r.invFile){
              h+='<a href="'+esc(r.invFile)+'" target="_blank" class="btn-approve" style="background:#3b82f6;text-decoration:none;margin:0;display:inline-flex;align-items:center;gap:4px" download>📄 下载发票</a>';
            }else{
              h+='<button class="btn-approve" onclick="uploadInvoiceFile('+r.id+')" style="background:#8b5cf6;margin:0">📤 上传发票文件</button>';
            }
          }
        }
        if(r.status==='rejected'){
          h+='<button class="btn-approve" onclick="reapplyInvoice('+r.id+')" style="margin:0">重新申请</button>';
          if(r.appliedBy===curUser.name) h+='<button class="btn-danger" onclick="deleteInvoiceRecord('+r.id+')" style="margin:0;background:#ef4444;color:#fff">删除</button>';
        }
        h+='<button class="btn-view" onclick="navigateTo('+"'invoice'"+')" style="margin-left:auto">查看列表</button>';
        h+='</div></div>';
      }
      h+='</div>';
      parts.push(h);
    }
  }

  // 渲染全部
  if(parts.length===0){
    var statusLabel={pending:"待审批",done:"已审批",rejected:"已驳回"};
    container.innerHTML='<div class="empty-state" style="padding:60px 20px;text-align:center;color:#999"><p style="font-size:15px">暂无'+statusLabel[_st]+'</p></div>';
  }else{
    container.innerHTML=parts.join('<div style="border-top:2px dashed #e5e7eb;margin:8px 0"></div>');
  }
}
function showOrderDetail(id){
  var o=null;for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].id===id){o=DB_ORDERS[i];break}}
  if(!o)return;sumOrder(o);
  var pgTag={'已办结':'tag-green','跟进中':'tag-blue','待处理':'tag-gray'},ctTag={'新客户':'tag-purple','老客户':'tag-gray'};
  var h='<div class="order-detail" onclick="event.stopPropagation()">'
    +'<div class="order-detail-header"><h3>订单详情 - '+esc(o.bn)+'</h3><button class="order-detail-close" onclick="this.closest(\'.order-detail-overlay\').remove()">&times;</button></div>'
    +'<div class="order-detail-body">'
    +'<div class="detail-grid">'
    +'<div class="detail-item"><div class="detail-label">业务编号</div><div class="detail-value">'+esc(o.bn)+'</div></div>'
    +'<div class="detail-item"><div class="detail-label">业务类型</div><div class="detail-value">'+esc(o.bt)+'</div></div>'
    +'<div class="detail-item"><div class="detail-label">业务员</div><div class="detail-value">'+esc(o.sl)+'</div></div>'
    +'<div class="detail-item"><div class="detail-label">对接账号</div><div class="detail-value">'+esc(o.ac||'-')+'</div></div>'
    +'<div class="detail-item"><div class="detail-label">客户昵称</div><div class="detail-value">'+esc(o.nn||'-')+'</div></div>'
    +'<div class="detail-item"><div class="detail-label">微信</div><div class="detail-value">'+esc(o.wx||'-')+'</div></div>'
    +'<div class="detail-item"><div class="detail-label">客户类型</div><div class="detail-value"><span class="'+(ctTag[o.ct]||'tag-gray')+'">'+esc(o.ct)+'</span></div></div>'
    +'<div class="detail-item"><div class="detail-label">内勤</div><div class="detail-value">'+esc(o.nq||'-')+'</div></div>'
    +'<div class="detail-item"><div class="detail-label">进度</div><div class="detail-value"><span class="'+(pgTag[o.pg]||'tag-gray')+'">'+esc(o.pg)+'</span></div></div>'
    +'<div class="detail-item full"><div class="detail-label">备注</div><div class="detail-value">'+esc(o.rk||'-')+'</div></div>'
    +'</div>'
    +'<div class="detail-section" style="margin-top:16px">财务汇总</div>'
    +'<div style="display:flex;justify-content:space-around;padding:12px 0;margin-bottom:12px;background:#f9fafb;border-radius:6px">'
    +'<div style="text-align:center"><div style="color:#6b7280;font-size:11px;margin-bottom:4px">总收款</div><div class="num-income" style="font-size:16px;font-weight:600">'+fmtM(o.pm_total||0)+'</div></div>'
    +'<div style="text-align:center"><div style="color:#6b7280;font-size:11px;margin-bottom:4px">总支出</div><div class="num-cost" style="font-size:16px;font-weight:600">'+fmtM(o.exp_total||0)+'</div></div>'
    +'<div style="text-align:center"><div style="color:#6b7280;font-size:11px;margin-bottom:4px">总成本</div><div class="num-cost" style="font-size:16px;font-weight:600">'+fmtM(o.cost_total||0)+'</div></div>'
    +'<div style="text-align:center"><div style="color:#6b7280;font-size:11px;margin-bottom:4px">总收益</div><div class="num-profit" style="font-size:18px;font-weight:700">'+fmtM(o.profit_total)+'</div></div>'
    +'</div>'
    +'<div class="detail-section">订单明细（共'+(o.items?o.items.length:0)+'个）</div>';
  if(o.items&&o.items.length>0){
    h+='<div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th>子订单编号</th><th>单位名称</th><th>地址</th><th>时长(年)</th><th>收款金额</th><th>支出金额</th><th>成本</th><th>收益</th><th>备注</th></tr></thead><tbody>';
    for(var j=0;j<o.items.length;j++){var it=o.items[j];
      var itemPm=0,itemPayRecords=it.pr_records||[];
      for(var pi=0;pi<itemPayRecords.length;pi++){if(!itemPayRecords[pi].prej)itemPm+=(itemPayRecords[pi].pm||0)}
      var itemXm=0,itemExpRecords=it.xr||[];
      for(var ei=0;ei<itemExpRecords.length;ei++){if(!itemExpRecords[ei].xrej)itemXm+=(parseFloat(itemExpRecords[ei].xm)||0)}
      var itemProfit=itemPm-(it.cost||0)-itemXm;
      var years=it.sd&&it.ed?Math.round((daysBetween(it.ed,it.sd)/365)*10)/10:'-';
      var durTitle=it.sd&&it.ed?esc(it.sd)+' ~ '+esc(it.ed):'';
      h+='<tr><td style="font-weight:600">'+esc(it.subBn||'-')+'</td><td>'+esc(it.co||'-')+'</td><td>'+esc(it.addr||'-')+'</td><td style="text-align:center" title="'+durTitle+'">'+years+'</td>'
        +'<td class="num-income">'+fmtM(itemPm)+'</td>'
        +'<td class="num-cost">'+fmtM(itemXm)+'</td>'
        +'<td class="num-cost">'+fmtM(it.cost||0)+'</td>'
        +'<td class="num-profit">'+fmtM(itemProfit)+'</td>'
        +'<td title="'+esc(it.rk||'')+'" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(it.rk||'-')+'</td></tr>'}
    h+='</tbody></table></div>';
  }
  // 收入明细汇总
  var allPayments=[];
  if(o.items){for(var pj=0;pj<o.items.length;pj++){var pit=o.items[pj];var precs=pit.pr_records||[];for(var pk=0;pk<precs.length;pk++){var prec=precs[pk];allPayments.push({subBn:pit.subBn||'-',co:pit.co||o.co||'',addr:pit.addr||'',pm:prec.pm||0,pf:prec.pf||'',prej:prec.prej||'',pd:prec.pd||'',pa:prec.pa||'',rk:prec.rk||'',payNo:prec.payNo||'',pxi:prec.pxi||''})}}}
  if(allPayments.length>0){
    var approvedPays=allPayments.filter(function(e){return e.pf&&!e.prej}).length;
    h+='<div class="detail-section" style="margin-top:12px">收入明细（共'+allPayments.length+'笔，已确认'+approvedPays+'笔）</div>'
      +'<div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th>子订单</th><th>单位</th><th>金额</th><th>账号</th><th>截图</th><th>状态</th><th>时间</th><th>备注</th></tr></thead><tbody>';
    for(var pl=0;pl<allPayments.length;pl++){
      var pr=allPayments[pl];
      var payStatus=pr.pf&&!pr.prej?'✅ 已确认':pr.prej?'❌ 已驳回:'+esc(pr.prej):'⏳ 待确认';
      h+='<tr><td>'+esc(pr.subBn)+'</td><td>'+esc(pr.co)+'</td>'
        +'<td class="num-income">'+fmtM(pr.pm)+'</td>'
        +'<td style="font-size:11px">'+esc(pr.pa||'-')+'</td>'
        +'<td style="text-align:center">'+(pr.pxi?renderImgThumbs(pr.pxi,'width:28px;height:28px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;'):'<span style="color:#ccc;font-size:10px">-</span>')+'</td>'
        +'<td style="font-size:11px">'+payStatus+'</td>'
        +'<td style="white-space:nowrap;font-size:11px">'+(pr.pf||pr.pd||'').slice(0,10)+'</td>'
        +'<td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px" title="'+esc(pr.rk||'')+'">'+esc(pr.rk||'-')+'</td></tr>';
    }
    h+='</tbody></table></div>';
  }
  // 支出明细汇总
  var allExps=[];
  if(o.items){for(var ej=0;ej<o.items.length;ej++){var eit=o.items[ej];var recs=eit.xr||[];for(var ek=0;ek<recs.length;ek++){var rec=recs[ek];allExps.push({subBn:eit.subBn||'-',co:eit.co||o.co||'',addr:eit.addr||'',xm:rec.xm||0,xf:rec.xf||'',xrej:rec.xrej||'',xd:rec.xd||'',rk:rec.rk||'',expAccount:rec.xa_actual||rec.expAccount||'',payee:rec.payee||'',xi:rec.xi||'',xi_voucher:rec.xi_voucher||''})}}}
  if(allExps.length>0){
    var approvedExps=allExps.filter(function(e){return e.xf}).length;
    h+='<div class="detail-section" style="margin-top:12px">支出明细（共'+allExps.length+'笔，已通过'+approvedExps+'笔）</div>'
      +'<div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th>子订单</th><th>单位</th><th>金额</th><th>账号</th><th>对象</th><th>申请截图</th><th>审批凭证</th><th>状态</th><th>时间</th><th>备注</th></tr></thead><tbody>';
    for(var el=0;el<allExps.length;el++){
      var er=allExps[el];
      var expStatus=er.xf?'✅ 已通过':er.xrej?'❌ 已驳回:'+esc(er.xrej):'⏳ 待审批';
      h+='<tr><td>'+esc(er.subBn)+'</td><td>'+esc(er.co)+'</td>'
        +'<td class="num-cost">'+fmtM(er.xm)+'</td>'
        +'<td style="font-size:11px">'+esc(er.expAccount||'-')+'</td>'
        +'<td style="font-size:11px">'+esc(er.payee||'-')+'</td>'
        +'<td style="text-align:center">'+(er.xi?renderImgThumbs(er.xi,'width:28px;height:28px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;'):'<span style="color:#ccc;font-size:10px">-</span>')+'</td>'
        +'<td style="text-align:center">'+(er.xi_voucher?renderImgThumbs(er.xi_voucher,'width:28px;height:28px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;'):'<span style="color:#ccc;font-size:10px">-</span>')+'</td>'
        +'<td style="font-size:11px">'+expStatus+'</td>'
        +'<td style="white-space:nowrap;font-size:11px">'+(er.xf||er.xd||'').slice(0,10)+'</td>'
        +'<td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px" title="'+esc(er.rk||'')+'">'+esc(er.rk||'-')+'</td></tr>';
    }
    h+='</tbody></table></div>';
  }
  h+='</div></div>';
  var overlay=document.createElement('div');overlay.className='order-detail-overlay';overlay.innerHTML=h;overlay.onclick=function(){overlay.remove()};document.body.appendChild(overlay);
}
function showOrderDetailByBn(bn){
  for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].bn===bn){showOrderDetail(DB_ORDERS[i].id);return}}
  toast('未找到该业务编号的订单','error');
}
function editOrder(id){var o=null;for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].id===id){o=DB_ORDERS[i];break}}if(o)openOrderModal(o)}
function delOrder(id){
  var o=null;
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].id===id){o=DB_ORDERS[i];break}
  }
  if(!o)return;
  // 检查是否有子订单在审批中或已通过
  if(o.items&&o.items.length>0){
    var locked=false;
    for(var k=0;k<o.items.length;k++){
      var st=o.items[k].itemStatus||'draft';
      if(st==='approved'){locked=true;break}
    }
    if(locked&&curRole!=='admin'){toast('存在审批中或已通过的子订单，无法删除');return}
  }
  // 收集关联地址
  var orderAddrs=[];
  if(o.items){
    for(var dj=0;dj<o.items.length;dj++){
      var da=o.items[dj].addr;
      if(da&&da.trim())orderAddrs.push(da.trim());
    }
  }
  // 自定义弹窗：三个选项
  var hasAddr=orderAddrs.length>0;
  var overlay=document.createElement('div');
  overlay.className='modal-overlay active';
  overlay.style.display='flex';
  overlay.innerHTML='<div class="modal-box" style="max-width:420px"><div class="modal-header"><h3>删除订单</h3></div>'
    +'<div class="modal-body"><p style="font-size:14px;color:#333;margin:0 0 12px 0">确认删除订单 <strong>'+esc(o.bn||'('+o.id+')')+'</strong>？</p>'
    +(hasAddr?'<p style="font-size:13px;color:#888;margin:0 0 12px 0">该订单下关联 <strong>'+orderAddrs.length+'</strong> 个地址</p>':'')
    +'<label style="display:block;padding:10px 14px;border:1px solid #d9d9d9;border-radius:6px;margin-bottom:8px;cursor:pointer;background:#fafafa">'
    +'<input type="radio" name="del-order-choice" value="delete_only" checked style="margin-right:8px">'
    +'<strong>仅删除订单</strong><br><span style="font-size:12px;color:#888;margin-left:22px">地址保持不变，不会释放</span></label>'
    +(hasAddr?'<label style="display:block;padding:10px 14px;border:1px solid #d9d9d9;border-radius:6px;margin-bottom:8px;cursor:pointer">'
      +'<input type="radio" name="del-order-choice" value="clear_addr" style="margin-right:8px">'
      +'<strong>删除订单并清空关联地址</strong><br><span style="font-size:12px;color:#888;margin-left:22px">地址变回空置，关联信息一并清空</span></label>':'')
    +'</div><div class="modal-footer"><button class="btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>'
    +'<button class="btn-danger" onclick="doDelOrder('+id+')">确认删除</button></div></div>';
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove()};
  document.body.appendChild(overlay);
}
function doDelOrder(id){
  try{
  var choice=document.querySelector('input[name="del-order-choice"]:checked');
  var clearAddr=choice&&choice.value==='clear_addr';
  var orderAddrs=[];
  if(clearAddr){
    for(var di=0;di<DB_ORDERS.length;di++){
      if(DB_ORDERS[di].id==id&&DB_ORDERS[di].items){
        for(var dj=0;dj<DB_ORDERS[di].items.length;dj++){
          var da=DB_ORDERS[di].items[dj].addr;
          if(da&&da.trim())orderAddrs.push(da.trim());
        }
      }
    }
    for(var ai=0;ai<orderAddrs.length;ai++){
      try{clearAddressOrderInfo(orderAddrs[ai]);}catch(e){}
    }
  }
  DB_ORDERS=DB_ORDERS.filter(function(x){return x.id!=id});
  syncAll();
  toast(clearAddr?'已删除订单，地址已清空':'已删除订单（地址保留）');
  renderOrdersTable();renderRenewTable();
  // 只关闭删除确认弹窗（删除前动态创建的），保留原始 modal HTML 结构
  var overlays=document.querySelectorAll('.modal-overlay');
  for(var ovi=0;ovi<overlays.length;ovi++){
    // 跳过原始的 modal-overlay（有id="modal-overlay"的留着，是HTML结构的一部分）
    if(overlays[ovi].id==='modal-overlay')continue;
    overlays[ovi].remove();
  }
  }catch(e){toast('删除出错:'+e.message,'error')}
}
function delSubOrder(oid,idx){
  // 检查权限
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].id===oid&&DB_ORDERS[i].items&&DB_ORDERS[i].items[idx]){
      var st=DB_ORDERS[i].items[idx].itemStatus||'draft';
      if(st==='approved'&&curRole!=='admin'){toast('已审批通过的子订单不可删除');return}
      break;
    }
  }
  // 自定义弹窗：询问地址如何处理
  var overlay=document.createElement('div');
  overlay.className='modal-overlay active';
  overlay.style.display='flex';
  overlay.innerHTML='<div class="modal-box" style="max-width:400px"><div class="modal-header"><h3>删除子订单</h3></div>'
    +'<div class="modal-body"><p style="font-size:14px;color:#333;margin:0 0 12px 0">删除该子订单后，关联地址如何处理？</p>'
    +'<label style="display:block;padding:10px 14px;border:1px solid #d9d9d9;border-radius:6px;margin-bottom:8px;cursor:pointer;background:#fafafa" id="fu-opt1">'
    +'<input type="radio" name="fu-choice" value="keep" checked style="margin-right:8px">'
    +'<strong>仅删除订单</strong><br><span style="font-size:12px;color:#888;margin-left:22px">地址保持已占用，不会释放</span></label>'
    +'<label style="display:block;padding:10px 14px;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer" id="fu-opt2">'
    +'<input type="radio" name="fu-choice" value="release" style="margin-right:8px">'
    +'<strong>删除并释放地址</strong><br><span style="font-size:12px;color:#888;margin-left:22px">地址变回空置，可重新分配</span></label>'
    +'</div><div class="modal-footer"><button class="btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>'
    +'<button class="btn-danger" onclick="doDelSubOrder('+oid+','+idx+')">确认删除</button></div></div>';
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove()};
  document.body.appendChild(overlay);
}
function doDelSubOrder(oid,idx){
  // 获取用户选择
  var choice=document.querySelector('input[name="fu-choice"]:checked');
  var releaseAddr=choice&&choice.value==='release';
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].id===oid){
      if(DB_ORDERS[i].items&&DB_ORDERS[i].items[idx]){
        var deletedAddr=DB_ORDERS[i].items[idx].addr;
        DB_ORDERS[i].items.splice(idx,1);
        sumOrder(DB_ORDERS[i]);
        // 根据用户选择决定是否释放地址
        if(releaseAddr&&deletedAddr){
          clearAddressOrderInfo(deletedAddr);
        }
        // 仅删除订单：不动地址任何数据
        updateParentOrderStatus(DB_ORDERS[i]);
        syncAll();
        toast(releaseAddr?'子订单已删除，地址已释放':'子订单已删除（地址保留）');
        renderOrdersTable();
      }
      break;
    }
  }
  // 查找并关闭弹窗（保留原始 modal HTML 结构）
  var overlays=document.querySelectorAll('.modal-overlay');
  for(var ovi=0;ovi<overlays.length;ovi++){
    if(overlays[ovi].id==='modal-overlay')continue;
    overlays[ovi].remove();
  }
}

// 子订单详情弹窗
function showItemDetail(oid,idx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items||!o.items[idx]){toast('数据异常','error');return;}
  var it=o.items[idx];
  var statusMap={draft:'',pending:'待审批',approved:'已通过',rejected:'已驳回'};
  var methodMap={wechat:'微信二维码',alipay_qr:'支付宝二维码',alipay_account:'支付宝账号',bank:'对公账号'};
  var itemStatus=it.itemStatus||'draft';
  var statusTag=itemStatus==='draft'?'tag-gray':itemStatus==='pending'?'tag-orange':itemStatus==='approved'?'tag-green':'tag-red';

  var html='<div class="item-detail-popup" style="max-height:70vh;overflow-y:auto;padding:0 4px;">';
  html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:2px solid #e5e7eb;">';
  html+='<h3 style="margin:0">子订单详情</h3><span class="order-bn-tag">'+esc(it.subBn||'')+'</span><span class="tag-'+statusTag.replace('tag-','')+'">'+statusMap[itemStatus]+'</span>';
  html+='</div>';

  // 基本信息
  html+='<div style="margin-bottom:16px">';
  html+='<div style="font-weight:600;color:#374151;margin-bottom:8px;font-size:13px;text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:6px">基本信息</div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">';
  html+='<div style="text-align:center"><span style="color:#6b7280">单位名称：</span>'+esc(it.co||'-')+'</div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">地址：</span>'+esc(it.addr||'-')+'</div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">注册类型：</span>'+esc(it.rt||'-')+'</div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">联系电话：</span>'+esc(it.ph||'-')+'</div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">法人：</span>'+esc(it.lp||'-')+'</div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">开始时间：</span>'+esc(it.sd||'-')+'</div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">结束时间：</span>'+esc(it.ed||'-')+'</div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">报价：</span>'+fmtM(it.pr)+'</div>';
  html+='</div></div>';

  // 收款记录（支持多条）
  html+='<div style="margin-bottom:16px">';
  html+='<div style="font-weight:600;color:#374151;margin-bottom:8px;font-size:13px;text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:6px">收款记录</div>';
  var payRecords=it.pr_records||[];
  if(payRecords.length===0){
    html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">';
    html+='<div style="text-align:center"><span style="color:#6b7280">收款时间：</span>'+esc(it.pd||'-')+'</div>';
    html+='<div style="text-align:center"><span style="color:#6b7280">收款账号：</span>'+esc(it.pa||'-')+'</div>';
    html+='<div style="text-align:center"><span style="color:#6b7280">收款金额：</span><span class="num-income">'+fmtM(it.pm||0)+'</span></div>';
    html+='</div>';
  }else{
    html+='<div style="overflow-x:auto">';
    html+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html+='<thead><tr style="background:#f9fafb"><th style="text-align:center">时间</th><th style="text-align:center">编号</th><th style="text-align:center">金额</th><th style="text-align:center">收款账号</th><th style="text-align:center">截图</th><th style="text-align:center">状态</th><th style="text-align:center">备注</th></tr></thead><tbody>';
    var payTotal=0;
    for(var pi=0;pi<payRecords.length;pi++){
      var pr=payRecords[pi];
      if(!pr.prej)payTotal+=(pr.pm||0);
      var prStatus=pr.pf?'已确认':pr.prej?'已驳回':'待审批';
      var prStatusCls=pr.pf?'tag-green':pr.prej?'tag-red':'tag-orange';
      var prRemark=pr.rk||'';
      if(pr.prej) prRemark=(prRemark?prRemark+'；驳回：':'驳回：')+pr.prej;
      html+='<tr style="border-bottom:1px solid #f3f4f6">';
      html+='<td style="padding:6px 4px;text-align:center">'+esc(pr.pd||'-')+'</td>';
      html+='<td style="padding:6px 4px;text-align:center;font-size:11px;color:#1d4ed8">'+esc(pr.payNo||'-')+'</td>';
      html+='<td style="padding:6px 4px;text-align:center" class="num-income">'+fmtM(pr.pm||0)+'</td>';
      html+='<td style="padding:6px 4px;text-align:center">'+esc(pr.pa||'-')+'</td>';
      html+='<td style="padding:6px 4px;text-align:center">'+(pr.pi&&pr.pi.trim()!==''?renderImgThumbs(pr.pi,'width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;margin:1px;'):'<span style="color:#d1d5db">无</span>')+'</td>';
      html+='<td style="padding:6px 4px;text-align:center"><span class="'+prStatusCls+'">'+prStatus+'</span></td>';
      html+='<td style="padding:6px 4px;text-align:center" title="'+esc(prRemark)+'"><span style="color:'+(pr.prej?'#dc2626':'#6b7280')+'">'+esc(prRemark.substring(0,10))+(prRemark.length>10?'...':'')+'</span></td>';
      html+='</tr>';
    }
    html+='</tbody></table></div>';
    html+='<div style="margin-top:6px;text-align:center;font-size:13px;font-weight:600;color:#059669">收款合计：'+fmtM(payTotal)+'</div>';
  }
  html+='</div>';

  // 支出记录（支持多条）
  html+='<div style="margin-bottom:16px">';
  html+='<div style="font-weight:600;color:#374151;margin-bottom:8px;font-size:13px;text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:6px">支出记录</div>';
  var expRecords=it.xr||[];
  if(expRecords.length===0){
    html+='<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px">暂无支出记录</div>';
  }else{
    html+='<div style="overflow-x:auto">';
    html+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html+='<thead><tr style="background:#f9fafb"><th style="text-align:center">时间</th><th style="text-align:center">编号</th><th style="text-align:center">金额</th><th style="text-align:center">对象</th><th style="text-align:center">支出账号</th><th style="text-align:center">截图</th><th style="text-align:center">状态</th><th style="text-align:center">备注</th></tr></thead>';
    html+='<tbody>';
    var expTotal=0;
    for(var ri=0;ri<expRecords.length;ri++){
      var rec=expRecords[ri];
      if(!rec.xrej)expTotal+=(parseFloat(rec.xm)||0);
      var recStatus=rec.xf?'已确认':rec.xrej?'已驳回':'待确认';
      var recStatusCls=rec.xf?'tag-green':rec.xrej?'tag-red':'tag-orange';
      var recRemark=rec.rk||'';
      if(rec.xrej) recRemark=(recRemark?recRemark+'；驳回：':'驳回：')+rec.xrej;
      var payDetail={};
      try{payDetail=rec.xb?JSON.parse(rec.xb):{};}catch(e){payDetail={};}
      var accountText='';
      if(rec.xp==='alipay_account'){
        accountText=(payDetail.alipayAccount||'')+' '+(payDetail.alipayName||'');
      }else if(rec.xp==='bank'){
        accountText=(payDetail.bankName||'')+' '+(payDetail.bankAccount||'')+' '+(payDetail.bankHolder||'');
      }else if(rec.xp==='wechat'){
        accountText='微信二维码';
      }else if(rec.xp==='alipay_qr'){
        accountText='支付宝二维码';
      }else{
        accountText='-';
      }
      html+='<tr style="border-bottom:1px solid #f3f4f6">';
      html+='<td style="padding:6px 4px;text-align:center">'+esc(rec.xd||'-')+'</td>';
      html+='<td style="padding:6px 4px;text-align:center;font-size:11px;color:#1d4ed8">'+esc(rec.expNo||'-')+'</td>';
      html+='<td style="padding:6px 4px;text-align:center" class="num-cost">'+fmtM(rec.xm||0)+'</td>';
      html+='<td style="padding:6px 4px;text-align:center" title="'+esc(rec.payee||'')+'">'+esc((rec.payee||'-').substring(0,10))+'</td>';
      html+='<td style="padding:6px 4px;text-align:center" title="'+esc(accountText)+'">'+esc(accountText.substring(0,15))+(accountText.length>15?'...':'')+'</td>';
      html+='<td style="padding:6px 4px;text-align:center">'+(rec.xi && rec.xi.trim()!==''?renderImgThumbs(rec.xi,'width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;margin:1px;'):'<span style="color:#d1d5db">无</span>')+'</td>';
      html+='<td style="padding:6px 4px;text-align:center"><span class="tag-'+recStatusCls.replace('tag-','')+'">'+recStatus+'</span></td>';
      html+='<td style="padding:6px 4px;text-align:center" title="'+esc(recRemark)+'"><span style="color:'+(rec.xrej?'#dc2626':'#6b7280')+'">'+esc(recRemark.substring(0,10))+(recRemark.length>10?'...':'')+'</span></td>';
      html+='</tr>';
    }
    html+='</tbody></table></div>';
    html+='<div style="margin-top:6px;text-align:center;font-size:13px;font-weight:600;color:#d97706">支出合计：'+fmtM(expTotal)+'</div>';
  }
  html+='</div>';

  // 收益汇总（排除已驳回的记录）
  html+='<div style="margin-bottom:8px">';
  html+='<div style="font-weight:600;color:#374151;margin-bottom:8px;font-size:13px;text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:6px">收益汇总（已排除驳回记录）</div>';
  // 计算实际收款总额
  var payRecordsSum=it.pr_records||[];
  var realPm=0;
  for(var si=0;si<payRecordsSum.length;si++){if(!payRecordsSum[si].prej)realPm+=(payRecordsSum[si].pm||0)}
  if(payRecordsSum.length===0)realPm=it.pm||0;
  // 计算实际支出总额
  var expRecordsSum=it.xr||[];
  var realXm=0;
  for(var si2=0;si2<expRecordsSum.length;si2++){if(!expRecordsSum[si2].xrej)realXm+=(parseFloat(expRecordsSum[si2].xm)||0)}
  var realProfit=realPm-(it.cost||0)-realXm;
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;padding:12px;background:#f9fafb;border-radius:6px">';
  html+='<div style="text-align:center"><span style="color:#6b7280">总收款：</span><span class="num-income">'+fmtM(realPm)+'</span></div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">总支出：</span><span class="num-cost">'+fmtM(realXm)+'</span></div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">总成本：</span><span class="num-cost">'+fmtM(it.cost||0)+'</span></div>';
  html+='<div style="text-align:center"><span style="color:#6b7280">收益：</span><span class="num-profit" style="font-weight:600">'+fmtM(realProfit)+'</span></div>';
  html+='</div></div>';

  // 备注
  if(it.rk){
    html+='<div style="margin-bottom:8px;font-size:13px;text-align:left"><span style="color:#6b7280">备注：</span>'+esc(it.rk)+'</div>';
  }

  html+='</div>';
  showModal('子订单详情',html,null);
}

// 编辑子订单弹窗
var _currentEditingOrderId=null; // 保存当前正在编辑的母订单ID
function editSubOrder(oid,idx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items||!o.items[idx]){toast('数据异常','error');return;}
  var it=o.items[idx];
  var itData=Object.assign({},it); // 复制数据用于编辑
  
  // 生成支出记录列表
  var expRecords=it.xr||[];
  var expRecordsHtml='';
  for(var ri=0;ri<expRecords.length;ri++){
    var rec=expRecords[ri];
    var recStatus=rec.xf?'已确认':rec.xrej?'已驳回':'待确认';
    expRecordsHtml+='<div style="padding:6px;background:#f9fafb;border-radius:4px;margin-bottom:4px;font-size:12px">';
    expRecordsHtml+='<div><span style="color:#6b7280">时间：</span>'+esc(rec.xd||'-')+' <span style="color:#6b7280">金额：</span><span class="num-cost">¥'+fmtM(rec.xm||0)+'</span> <span style="color:#6b7280">状态：</span>'+esc(recStatus)+'</div>';
    if(rec.rk)expRecordsHtml+='<div><span style="color:#6b7280">备注：</span>'+esc(rec.rk)+'</div>';
    if(rec.xrej)expRecordsHtml+='<div><span style="color:#dc2626">驳回原因：</span>'+esc(rec.xrej)+'</div>';
    expRecordsHtml+='</div>';
  }
  if(!expRecordsHtml)expRecordsHtml='<div style="color:#9ca3af;text-align:center;padding:8px">暂无支出记录</div>';
  
  // 构建业务类型下拉
  var btOpts='<option value="">请选择业务类型</option>';
  for(var bk in BT_MAP){
    btOpts+='<option value="'+bk+'"'+(it.bt===bk?' selected':'')+'>'+BT_MAP[bk]+'</option>';
  }
  // 构建会计下拉
  var acctOpts='<option value="">请选择</option>';
  var acctUsers=DB_USERS.filter(function(u){return u.role==='accountant'});
  for(var ai=0;ai<acctUsers.length;ai++){
    acctOpts+='<option value="'+esc(acctUsers[ai].name)+'"'+(it.accountant===acctUsers[ai].name?' selected':'')+'>'+esc(acctUsers[ai].name)+'</option>';
  }
  var isAddrType=(it.bt==='new'||it.bt==='renew');
  var addrFieldsDisplay=isAddrType?'':'none';
  var editCurrentAddr=(it.addr||'').trim();

  var body='<form id="edit-sub-order"><div class="form-grid">'
    +'<div class="form-group"><label>子订单编号</label><input value="'+esc(it.subBn||'')+'" disabled style="background:#f5f5f5"/></div>'
    +'<div class="form-group"><label>子订单时间</label><input type="date" name="od" value="'+esc(it.subOd||'')+'"/></div>'
    +'<div class="form-group"><label>业务类型 <span style="color:red">*</span></label><select name="bt" id="edit-sub-bt" onchange="switchEditSubOrderBizType(this.value)">'+btOpts+'</select></div>'
    // 地址相关字段（根据it.bt决定初始显示）
    +'<div class="form-group" id="edit-addr-row" style="display:'+addrFieldsDisplay+'"><label>地址</label><select name="addr" id="edit-addr-select" style="width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;">'+(isAddrType?buildVacantAddrOpts(editCurrentAddr).opts:'<option value="">请先选择地址类业务类型</option>')+'</select></div>'
    +'<div class="form-group" id="edit-co-row" style="display:'+addrFieldsDisplay+'"><label>单位名称</label><input name="co" id="edit-sub-co" value="'+esc(it.co||'')+'" placeholder="请输入单位名称"/></div>'
    +'<div class="form-group" id="edit-rt-row" style="display:'+addrFieldsDisplay+'"><label>注册类型</label><select name="rt"><option value="">请选择</option><option value="个体户"'+(it.rt==='个体户'?' selected':'')+'>个体户</option><option value="公司"'+(it.rt==='公司'?' selected':'')+'>公司</option></select></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group" id="edit-ph-row" style="display:'+addrFieldsDisplay+'"><label>联系电话</label><input name="ph" id="edit-sub-ph" value="'+esc(it.ph||'')+'" placeholder="联系电话"/></div>'
    +'<div class="form-group" id="edit-lp-row" style="display:'+addrFieldsDisplay+'"><label>法人</label><input name="lp" id="edit-sub-lp" value="'+esc(it.lp||'')+'" placeholder="法人"/></div>'
    +'<div class="form-group" id="edit-sd-row" style="display:'+addrFieldsDisplay+'"><label>开始时间</label><input type="date" name="sd" id="edit-sub-sd" value="'+esc(it.sd||'')+'"/></div>'
    +'<div class="form-group" id="edit-ed-row" style="display:'+addrFieldsDisplay+'"><label>结束时间</label><input type="date" name="ed" id="edit-sub-ed" value="'+esc(it.ed||'')+'"/></div>'
    // 业务详情（非地址类型）
    +'<div class="form-group full" id="edit-bizdetail-row" style="display:'+(isAddrType?'none':'')+'"><label>业务详情</label><textarea name="bizDetail" rows="3" placeholder="请描述业务内容">'+esc(it.bizDetail||'')+'</textarea></div>'
    // 对接会计（代账/税务类）
    +'<div class="form-group" id="edit-accountant-row" style="display:'+((it.bt==='xindaizhang'||it.bt==='daizhang_renew'||it.bt==='shuiwu')?'':'none')+'"><label>对接会计</label><select name="accountant">'+acctOpts+'</select></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>报价</label><input type="number" name="pr" value="'+(it.pr||'')+'"/></div>'
    +'<div class="form-group"><label>成本</label><input type="number" name="cost" value="'+(it.cost||0)+'"/></div>'
    +'</div><div class="form-group full"><label>备注</label><textarea name="rk" rows="2">'+esc(it.rk||'')+'</textarea></div>'
    +'<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb">'
    +'<div style="font-weight:600;color:#374151;margin-bottom:8px;font-size:13px">支出记录</div>'
    +expRecordsHtml
    +'</div>'
    +'</form>';
  
  showModal('编辑子订单',body,function(){
    var f=getFormData('edit-sub-order');
    if(!f.bt){toast('请选择业务类型','error');return;}
    var editIsAddr=(f.bt==='new'||f.bt==='renew');
    
    if(editIsAddr){
      if(!f.addr){toast('请输入或选择地址','error');return;}
      if(f.bt!=='renew'&&f.addr!==it.addr&&!isAddrVacant(f.addr)){toast('该地址不在空置地址列表中','error');return;}
      if(f.bt!=='renew'&&f.addr!==it.addr&&isAddrOccupied(f.addr)){toast('该地址已被占用','error');return;}
    }else{
      if(!f.bizDetail){toast('请填写业务详情','error');return;}
    }
    var needEditAcct=(f.bt==='xindaizhang'||f.bt==='daizhang_renew'||f.bt==='shuiwu');
    if(needEditAcct&&!f.accountant){toast('请选择对接会计','error');return;}
    
    var oldAddr=it.addr||'';
    // 更新子订单数据
    Object.assign(it,{
      bt:f.bt,
      subOd:f.od||'',
      co:f.co||'',
      addr:editIsAddr?(f.addr||''):'',
      rt:editIsAddr?(f.rt||''):'',
      ph:editIsAddr?(f.ph||''):'',
      lp:editIsAddr?(f.lp||''):'',
      sd:editIsAddr?(f.sd||''):'',
      ed:editIsAddr?(f.ed||''):'',
      bizDetail:editIsAddr?'':(f.bizDetail||''),
      accountant:needEditAcct?(f.accountant||''):'',
      pr:parseFloat(f.pr)||0,
      cost:parseFloat(f.cost)||0,
      rk:f.rk||''
    });
    // 非地址类型利润设为null表示需设置
    if(!editIsAddr){it.profit=null;it.profitStatus='unset';}
    else{it.profitStatus='';it.profit=(it.pm||0)-(it.cost||0)-((it.xr||[]).reduce(function(s,r){return s+(parseFloat(r.xm_actual||r.xm)||0)},0));}
    sumOrder(o);
    // 地址变更处理
    if(editIsAddr&&oldAddr&&oldAddr!==f.addr){
      clearAddressOrderInfo(oldAddr);
    }
    // 同步地址表
    if(editIsAddr&&f.addr){
      var fullAddr=((f.ad||'')+(f.rm||'')).trim();
      for(var k=0;k<DB_ADDRESS.length;k++){
        var va=DB_ADDRESS[k];
        var vaFull=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
        if(vaFull===f.addr){
          DB_ADDRESS[k].bn=it.subBn;
          DB_ADDRESS[k].co=f.co||'';
          DB_ADDRESS[k].sl=o.sl;
          DB_ADDRESS[k].ac=o.ac||'';
          DB_ADDRESS[k].nn=o.nn||'';
          DB_ADDRESS[k].rt=f.rt||'';
          DB_ADDRESS[k].ph=f.ph||'';
          DB_ADDRESS[k].lp=f.lp||'';
          DB_ADDRESS[k].sd=f.sd||'';
          DB_ADDRESS[k].ed=f.ed||'';
          DB_ADDRESS[k].pr=parseFloat(f.pr)||0;
          DB_ADDRESS[k].cs=parseFloat(f.cost)||0;
          DB_ADDRESS[k].rk=f.rk||'';
          break;
        }
      }
    }
    syncAll();
    toast('子订单已更新');
    closeModal();
    // 如果正在母订单编辑弹窗中，刷新子订单明细列表
    if(_currentEditingOrderId){
      var listEl=document.getElementById('order-items-list');
      if(listEl){
        var curO=DB_ORDERS.find(function(x){return x.id===_currentEditingOrderId});
        if(curO&&curO.items){
          listEl.innerHTML='';
          window._orderItemIdx=0;
          for(var ri=0;ri<curO.items.length;ri++)addOrderItem(curO.items[ri]);
        }
      }
    }
    renderOrdersTable();
    if(typeof renderAddressTable==='function'&&curPage==='address')renderAddressTable();
  });
}

// ★ 图片上传到服务端（替代 base64 内嵌方案）
// 全局暂存：各上传控件的待上传文件对象（支持多文件，value=File数组）
var _pendingImgFiles={};  // key=inputId, value=File[]

function uploadImage(file){
  return new Promise(function(resolve,reject){
    if(!file){resolve('');return;}
    var fd=new FormData();
    fd.append('file',file);
    var apiBase='';
    var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
    var hdrs={};
    if(_token)hdrs['Authorization']='Bearer '+_token;
    fetch(apiBase+'/api/upload',{method:'POST',body:fd,headers:hdrs})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d.ok&&d.url)resolve(d.url);
        else reject(d.error||'上传失败');
      })
      .catch(function(e){reject(e);});
  });
}

// ★【多图支持】批量上传多个文件，返回URL数组
function uploadMultipleImages(files){
  if(!files||!files.length)return Promise.resolve([]);
  var promises=[];
  for(var i=0;i<files.length;i++){
    promises.push(uploadImage(files[i]));
  }
  return Promise.all(promises);
}

// 图片加载失败处理：替换为占位符
function handleImgError(img){
  img.style.display='none';
  var placeholder=document.createElement('span');
  placeholder.style.cssText='display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;background:#f3f4f6;border-radius:4px;color:#9ca3af;font-size:16px';
  placeholder.textContent='🖼';
  placeholder.title='图片加载失败';
  img.parentNode.insertBefore(placeholder,img.nextSibling);
}

// 图片预览
function previewImg(src){
  if(!src)return;
  var overlay=document.createElement('div');
  overlay.style='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  overlay.onclick=function(){overlay.remove()};
  overlay.innerHTML='<img src="'+src+'" style="max-width:90%;max-height:90%;border-radius:8px"/>';
  document.body.appendChild(overlay);
}

// ★【多图支持】解析 pxi/xi 字段为URL数组（兼容新旧格式：单字符串或JSON数组）
function parseImgUrls(val){
  if(!val)return [];
  if(typeof val==='string'){
    var trimmed=val.trim();
    if(!trimmed)return [];
    if(trimmed.startsWith('[')){
      try{
        var arr=JSON.parse(trimmed);
        return Array.isArray(arr)?arr.filter(function(u){return u&&u.trim();}):[trimmed];
      }catch(e){return [trimmed];}
    }
    return [trimmed];
  }
  if(Array.isArray(val))return val.filter(function(u){return u&&u.trim();});
  return [];
}

// ★【多图支持】将URL数组序列化为存储格式（单图保持字符串兼容）
function makeImgUrls(urls){
  if(!urls||!urls.length)return '';
  var arr=urls.filter(function(u){return u&&u.trim();});
  if(!arr.length)return '';
  if(arr.length===1)return arr[0];
  return JSON.stringify(arr);
}

// ★【多图支持】渲染图片缩略图组，支持删除模式
var _galleryCache={};
function renderImgThumbs(urls, imgStyle, containerStyle, deletable, fixedGid){
  var arr=parseImgUrls(urls);
  if(!arr.length)return '';
  var gid=fixedGid||('g_'+Date.now()+'_'+Math.random().toString(36).substr(2,4));
  _galleryCache[gid]=arr;
  var baseImgStyle=imgStyle||'width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;margin:1px;';
  var html='<div style="display:inline-flex;flex-wrap:wrap;gap:2px;'+(containerStyle||'')+'" id="img-grp-'+gid+'">';
  for(var i=0;i<arr.length;i++){
    var safeSrc=arr[i].replace(/"/g,'&quot;');
    html+='<div style="position:relative;display:inline-block">';
    if(deletable){
      html+='<span onclick="deleteGalleryImg(\''+gid+'\','+i+')" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;background:#ef4444;color:#fff;border-radius:50%;font-size:11px;line-height:18px;text-align:center;cursor:pointer;z-index:5;box-shadow:0 1px 3px rgba(0,0,0,.3)">&times;</span>';
    }
    html+='<img src="'+safeSrc+'" style="'+baseImgStyle+'" onclick="openGallery(\''+gid+'\','+i+')" onerror="handleImgError(this)"/></div>';
  }
  html+='</div>';
  return html;
}

// ★【多图支持】构建待上传文件预览缩略图（含红色X删除按钮）
function buildPendingImgWrap(dataUrl, fileKey, fileObj){
  var wrap=document.createElement('div');
  wrap.style.cssText='position:relative;display:inline-block;margin:3px';
  var delBtn=document.createElement('span');
  delBtn.innerHTML='&times;';
  delBtn.style.cssText='position:absolute;top:-6px;right:-6px;width:18px;height:18px;background:#ef4444;color:#fff;border-radius:50%;font-size:11px;line-height:18px;text-align:center;cursor:pointer;z-index:5;box-shadow:0 1px 3px rgba(0,0,0,.3)';
  delBtn.onclick=function(){
    // 从 _pendingImgFiles 中移除匹配的文件
    var arr=_pendingImgFiles[fileKey];
    if(arr){
      for(var di=arr.length-1;di>=0;di--){
        if(arr[di].name===fileObj.name && arr[di].size===fileObj.size && arr[di].lastModified===fileObj.lastModified){
          arr.splice(di,1);
          break;
        }
      }
      if(!arr.length) delete _pendingImgFiles[fileKey];
    }
    // 移除 DOM 中的缩略图
    var parent=wrap.parentNode;
    if(parent){
      wrap.remove();
      // 如果预览容器空了则隐藏
      if(!parent.children.length) parent.style.display='none';
    }
  };
  wrap.appendChild(delBtn);
  var img=document.createElement('img');
  img.src=dataUrl;
  img.style.cssText='width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #e2e8f0';
  img.onclick=function(){previewImg(dataUrl);};
  wrap.appendChild(img);
  return wrap;
}

// ★【多图支持】从图库中删除指定图片
function deleteGalleryImg(gid, idx){
  if(!_galleryCache[gid]||!_galleryCache[gid].length)return;
  confirmDialog('确定删除这张截图吗？',function(){
    _galleryCache[gid].splice(idx,1);
    var container=document.getElementById('img-grp-'+gid);
    if(container){
      var newUrls=_galleryCache[gid];
      var newUrlStr=newUrls.length?JSON.stringify(newUrls):'';
      // 更新全局待保存变量
      window._editImgData=window._editImgData||{};
      window._editImgData[gid]=newUrlStr;
      // 重新渲染
      container.outerHTML=renderImgThumbs(newUrlStr,'width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:pointer;margin:3px;border:1px solid #e2e8f0;','',true,gid);
    }
    toast('已删除该截图');
  });
}

// ★【多图支持】打开图库查看器
function openGallery(gid, index){
  var arr=_galleryCache[gid];
  if(!arr||!arr.length)return;
  showGalleryViewer(arr, index);
}

// ★【多图支持】全屏图库查看器（左右翻页）
var _currentViewerUrls=[];
var _currentViewerIndex=0;
function showGalleryViewer(urls, index){
  _currentViewerUrls=parseImgUrls(urls);
  if(!_currentViewerUrls.length)return;
  _currentViewerIndex=Math.max(0,Math.min(index||0,_currentViewerUrls.length-1));
  renderViewer();
}
function renderViewer(){
  var old=document.getElementById('gallery-viewer-overlay');
  if(old)old.remove();
  var arr=_currentViewerUrls;
  var idx=_currentViewerIndex;
  if(!arr||!arr.length)return;
  var overlay=document.createElement('div');
  overlay.id='gallery-viewer-overlay';
  overlay.style='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;flex-direction:column;';
  // 关闭按钮
  var closeBtn=document.createElement('div');
  closeBtn.style='position:absolute;top:15px;right:20px;color:rgba(255,255,255,0.6);font-size:28px;cursor:pointer;z-index:10001;line-height:1;';
  closeBtn.textContent='✕';
  closeBtn.onclick=function(e){e.stopPropagation();overlay.remove();};
  overlay.appendChild(closeBtn);
  // 图片容器
  var imgWrap=document.createElement('div');
  imgWrap.style='display:flex;align-items:center;justify-content:center;position:relative;max-width:92%;max-height:85vh;';
  // 左箭头
  if(arr.length>1){
    var leftBtn=document.createElement('button');
    leftBtn.textContent='‹';
    leftBtn.style=btnStyle(-60);
    leftBtn.onclick=function(e){e.stopPropagation();_currentViewerIndex=Math.max(0,_currentViewerIndex-1);renderViewer();};
    imgWrap.appendChild(leftBtn);
  }
  var img=document.createElement('img');
  img.src=arr[idx];
  img.style='max-width:100%;max-height:85vh;border-radius:8px;object-fit:contain;';
  imgWrap.appendChild(img);
  if(arr.length>1){
    var rightBtn=document.createElement('button');
    rightBtn.textContent='›';
    rightBtn.style=btnStyleForRight(60);
    rightBtn.onclick=function(e){e.stopPropagation();_currentViewerIndex=Math.min(arr.length-1,_currentViewerIndex+1);renderViewer();};
    imgWrap.appendChild(rightBtn);
  }
  overlay.appendChild(imgWrap);
  // 页码
  if(arr.length>1){
    var pg=document.createElement('div');
    pg.style='color:rgba(255,255,255,0.8);margin-top:12px;font-size:14px;';
    pg.textContent=(idx+1)+' / '+arr.length;
    overlay.appendChild(pg);
  }
  // 点击遮罩关闭
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove();};
  document.body.appendChild(overlay);
  
  function btnStyle(offset){
    return 'position:absolute;left:'+offset+'px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:50%;width:44px;height:44px;font-size:30px;cursor:pointer;z-index:10001;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;';
  }
  function btnStyleForRight(offset){
    return 'position:absolute;right:'+offset+'px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:50%;width:44px;height:44px;font-size:30px;cursor:pointer;z-index:10001;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;';
  }
}

// 从母订单编辑弹窗中打开子订单编辑
function openSubOrderEditFromModal(idx){
  var oid=_currentEditingOrderId;
  if(!oid){
    toast('无法获取母订单信息','error');
    return;
  }
  editSubOrder(oid,idx);
}

// 批量重新计算所有子订单收益
function recalcAllProfits(){
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(o.items){
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        // 收款：汇总非驳回的 pr_records
        var payRecs=it.pr_records||[];
        var pm=0;
        if(payRecs.length>0){
          for(var pi=0;pi<payRecs.length;pi++){if(!payRecs[pi].prej)pm+=(payRecs[pi].pm||0)}
        }else{pm=(it.pm||0)}
        // 支出：汇总非驳回的 xr
        var expRecs=it.xr||[];
        var xm=0;
        for(var ei=0;ei<expRecs.length;ei++){if(!expRecs[ei].xrej)xm+=(parseFloat(expRecs[ei].xm_actual||expRecs[ei].xm)||0)}
        var cost=it.cost||0;
        if(pm>0){
          it.profit=pm-xm-cost;
        }else{
          it.profit=(it.pr||0)-xm-cost;
        }
      }
      sumOrder(o);
    }
  }
  syncAll();
  renderOrdersTable();
  toast('已重新计算所有子订单收益');
}
// 添加子订单 - 弹出填写框
var _pendingSubOrder={};
// 从母订单编辑弹窗中添加子订单（复用addSubOrder的弹窗逻辑，完成后刷新编辑弹窗中的子订单列表）
function addSubOrderFromEdit(oid){
  if(!oid){toast('无法添加子订单，母订单ID不存在','error');return;}
  addSubOrder(oid);
  // addSubOrder内部已经有刷新逻辑，但需要额外刷新母订单编辑弹窗中的子订单列表
  // 使用延时确保数据已保存
  setTimeout(function(){
    if(_currentEditingOrderId){
      var listEl=document.getElementById('order-items-list');
      if(listEl){
        var curO=DB_ORDERS.find(function(x){return x.id===_currentEditingOrderId});
        if(curO&&curO.items){
          listEl.innerHTML='';
          window._orderItemIdx=0;
          for(var ri=0;ri<curO.items.length;ri++)addOrderItem(curO.items[ri]);
        }
      }
    }
  },500);
}

function addSubOrder(oid){
  // 找到母订单
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o)return;
  var today=new Date();
  var y=today.getFullYear(),m=('0'+(today.getMonth()+1)).slice(-2),d=('0'+today.getDate()).slice(-2);
  var todayStr=y+'-'+m+'-'+d;
  // 结束时间 = 当天加一年减一天
  var endDate=new Date(today);endDate.setFullYear(endDate.getFullYear()+1);endDate.setDate(endDate.getDate()-1);
  var ey=endDate.getFullYear(),em=('0'+(endDate.getMonth()+1)).slice(-2),ed=('0'+endDate.getDate()).slice(-2);
  var endDateStr=ey+'-'+em+'-'+ed;
  // 生成子订单编号
  var subIdx=(o.items?o.items.length:0)+1;
  var subBn=(o.bn||'')+'-'+subIdx;
  // 构建业务类型下拉
  var btOpts='<option value="">请选择业务类型</option>';
  for(var bk in BT_MAP){
    btOpts+='<option value="'+bk+'">'+BT_MAP[bk]+'</option>';
  }
  // 构建会计下拉
  var acctOpts='<option value="">请选择</option>';
  var acctUsers=DB_USERS.filter(function(u){return u.role==='accountant'});
  for(var ai=0;ai<acctUsers.length;ai++){
    acctOpts+='<option value="'+esc(acctUsers[ai].name)+'">'+esc(acctUsers[ai].name)+'</option>';
  }
  // 地址下拉（先不获取，等选择地址类业务时再加载）
  var body='<form id="sub-order-form"><div class="form-grid">'
    +'<div class="form-group"><label>子订单编号</label><input value="'+esc(subBn)+'" disabled style="background:#f5f5f5"/></div>'
    +'<div class="form-group"><label>子订单时间</label><input type="date" name="od" value="'+todayStr+'"/></div>'
    +'<div class="form-group"><label>业务类型 <span style="color:red">*</span></label><select name="bt" id="sub-bt" onchange="switchSubOrderBizType(this.value)">'+btOpts+'</select></div>'
    // 地址相关字段（默认隐藏，选择地址类业务时显示）
    +'<div class="form-group" id="sub-addr-row" style="display:none"><label>地址 <span style="color:red">*</span></label><select name="addr" id="sub-addr-select" style="width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;"><option value="">请先选择业务类型</option></select></div>'
    +'<div class="form-group" id="sub-co-row"><label>单位名称</label><input name="co" id="sub-co" placeholder="请输入单位名称"/></div>'
    +'<div class="form-group" id="sub-rt-row" style="display:none"><label>注册类型</label><select name="rt"><option value="">请选择</option><option value="个体户">个体户</option><option value="公司">公司</option></select></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group" id="sub-ph-row" style="display:none"><label>联系电话</label><input name="ph" id="sub-ph" placeholder="联系电话"/></div>'
    +'<div class="form-group" id="sub-lp-row" style="display:none"><label>法人</label><input name="lp" id="sub-lp" placeholder="法人"/></div>'
    +'<div class="form-group" id="sub-sd-row" style="display:none"><label>开始时间</label><input type="date" name="sd" id="sub-sd" value="'+todayStr+'"/></div>'
    +'<div class="form-group" id="sub-ed-row" style="display:none"><label>结束时间</label><input type="date" name="ed" id="sub-ed" value="'+endDateStr+'"/></div>'
    // 业务详情（非地址类型使用）
    +'<div class="form-group full" id="sub-bizdetail-row" style="display:none"><label>业务详情 <span style="color:red">*</span></label><textarea name="bizDetail" rows="3" placeholder="请描述业务内容"></textarea></div>'
    // 对接会计（代账/税务类使用）
    +'<div class="form-group" id="sub-accountant-row" style="display:none"><label>对接会计 <span style="color:red">*</span></label><select name="accountant">'+acctOpts+'</select></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>报价</label><input type="number" name="pr" id="sub-pr" placeholder="请输入报价（地址类默认800）"/></div>'
    +'<div class="form-group"><label>成本</label><input type="number" name="cost" id="sub-cost" placeholder="请输入成本（地址类默认200）"/></div>'
    +'</div><div class="form-group full"><label>备注</label><textarea name="rk" rows="2" placeholder="请输入备注"></textarea></div>'
    +'</form>';
  showModal('添加子订单',body,function(){
    var f=getFormData('sub-order-form');
    if(!f.bt){toast('请选择业务类型','error');return;}
    var isAddrType=(f.bt==='new'||f.bt==='renew');

    if(isAddrType){
      // 地址类：先检查空置地址
      var addrSelEl=document.getElementById('sub-addr-select');
      if(!addrSelEl||!addrSelEl.value||addrSelEl.options.length<=1){
        toast('请先选择地址类业务类型以加载地址列表','error');return;
      }
      if(!f.addr){toast('请输入或选择地址','error');return;}
      if(f.bt!=='renew'&&!isAddrVacant(f.addr)){toast('该地址不在空置地址列表中，请选择地址表内的空置地址','error');return;}
      if(f.bt!=='renew'&&isAddrOccupied(f.addr)){toast('该地址已被占用，请选择空置地址','error');return;}
      if(!f.co){toast('请输入单位名称','error');return;}
      // 地址时长不足1年提醒
      if(f.sd&&f.ed&&checkDurationLessThanYear(f.sd,f.ed)){
        if(!confirm('⚠️ 地址时间不足1年，确认要添加吗？')){return;}
      }
    }else{
      // 非地址类：业务详情必填
      if(!f.bizDetail){toast('请填写业务详情','error');return;}
    }

    // 需要会计的类目
    var needAcct=(f.bt==='xindaizhang'||f.bt==='daizhang_renew'||f.bt==='shuiwu');
    if(needAcct&&!f.accountant){toast('请选择对接会计','error');return;}

    // 处理地址
    var addrVal=isAddrType?f.addr:'';
    var addrDetail={};
    if(isAddrType&&addrVal){
      var addrSel=document.getElementById('sub-addr-select');
      var selOpt=addrSel?addrSel.options[addrSel.selectedIndex]:null;
      if(selOpt&&selOpt.value){
        addrDetail={
          t:selOpt.getAttribute('data-t')||'',
          rm:selOpt.getAttribute('data-rm')||'',
          ac:selOpt.getAttribute('data-ac')||'',
          nn:selOpt.getAttribute('data-nn')||'',
          rt:selOpt.getAttribute('data-rt')||'',
          ph:selOpt.getAttribute('data-ph')||'',
          lp:selOpt.getAttribute('data-lp')||''
        };
      }
    }

    // 创建子订单
    var newItem={
      subBn:subBn,
      subOd:f.od||todayStr,
      bt:f.bt,
      co:f.co||'',
      addr:addrVal||'',
      t:addrDetail.t||'',
      rm:addrDetail.rm||'',
      ac:o.ac||'',
      nn:o.nn||'',
      rt:isAddrType?(f.rt||addrDetail.rt||''):'',
      ph:isAddrType?(f.ph||addrDetail.ph||''):'',
      lp:isAddrType?(f.lp||addrDetail.lp||''):'',
      sd:isAddrType?(f.sd||todayStr):'',
      ed:isAddrType?(f.ed||''):'',
      bizDetail:isAddrType?'':(f.bizDetail||''),
      accountant:needAcct?(f.accountant||''):'',
      pr:parseFloat(f.pr)||0,
      pd:'',
      pa:'',
      pm:0,
      xd:'',
      xa:'',
      xm:0,
      cost:parseFloat(f.cost)||0,
      profit:isAddrType?(parseFloat(f.pr)||0-(parseFloat(f.cost)||0)):null, // 非地址类利润设为null，表示需设置
      profitStatus:isAddrType?'':'unset',
      itemStatus:'draft',
      xr:[],
      rk:f.rk||''
    };
    if(!o.items)o.items=[];
    o.items.push(newItem);
    if(o.pg==='已办结'){o.pg='跟进中';}
    // 只有地址类型同步地址表
    if(isAddrType&&addrVal){
      for(var k=0;k<DB_ADDRESS.length;k++){
        var va=DB_ADDRESS[k];
        var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
        if(fullAddr===addrVal){
          DB_ADDRESS[k].bn=subBn;
          DB_ADDRESS[k].co=f.co||'';
          DB_ADDRESS[k].sl=o.sl;
          DB_ADDRESS[k].ac=o.ac||'';
          DB_ADDRESS[k].nn=o.nn||'';
          DB_ADDRESS[k].rt=f.rt||addrDetail.rt||'';
          DB_ADDRESS[k].ph=f.ph||newItem.ph||'';
          DB_ADDRESS[k].lp=f.lp||newItem.lp||'';
          DB_ADDRESS[k].sd=f.sd||newItem.sd||'';
          DB_ADDRESS[k].ed=f.ed||newItem.ed||'';
          DB_ADDRESS[k].pr=parseFloat(f.pr)||0;
          DB_ADDRESS[k].pd='';
          DB_ADDRESS[k].pa='';
          DB_ADDRESS[k].pm=0;
          DB_ADDRESS[k].cs=parseFloat(f.cost)||0;
          DB_ADDRESS[k].rk=f.rk||'';
          break;
        }
      }
    }
    // 立即渲染
    _expandedCustomers[o.bn||o.id]=true;
    renderOrdersTable();
    if(curPage==='address')renderAddressTable();
    closeModal();
    toast('已添加子订单 '+subBn);
    // 安全网
    var safeKey=o.bn||o.id;
    var safeOid=o.id;
    var savedItem=JSON.parse(JSON.stringify(newItem));
    setTimeout(function(){
      var check=DB_ORDERS.find(function(x){return x.id===safeOid});
      var hasSubItem=check&&check.items&&check.items.some(function(it){return it.subBn===subBn});
      if(!hasSubItem){
        if(check){if(!check.items)check.items=[];check.items.push(savedItem);console.log('[SAFETY NET] recovered')}
        syncAll();
      }
      _expandedCustomers[safeKey]=true;
      renderOrdersTable();
    }, 1200);
    syncAll();
  });
}
// 同步子订单数据到地址表（用于添加、编辑、审批等场景）
function syncSubOrderToAddress(subOrder, parentOrder){
  if(!subOrder||!subOrder.addr)return;
  var addrVal=subOrder.addr;
  for(var k=0;k<DB_ADDRESS.length;k++){
    var va=DB_ADDRESS[k];
    var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
    if(fullAddr===addrVal){
      // 同步子订单+母订单字段到地址表
      DB_ADDRESS[k].bn=parentOrder?parentOrder.bn:'';     // 业务编号
      DB_ADDRESS[k].co=subOrder.co||'';                    // 单位名称
      DB_ADDRESS[k].sl=parentOrder?parentOrder.sl:'';      // 业务员
      // ★ 对接账号和客户昵称从母订单继承（而非子订单）
      DB_ADDRESS[k].ac=parentOrder?parentOrder.ac:'';      // 对接账号
      DB_ADDRESS[k].nn=parentOrder?parentOrder.nn:'';      // 客户昵称
      DB_ADDRESS[k].rt=parentOrder?(parentOrder.rt||''):(subOrder.rt||'');  // 注册类型优先母订单
      DB_ADDRESS[k].ph=subOrder.ph||'';                    // 联系电话
      DB_ADDRESS[k].lp=subOrder.lp||'';                    // 法人
      DB_ADDRESS[k].sd=subOrder.sd||'';                    // 开始时间
      DB_ADDRESS[k].ed=subOrder.ed||'';                    // 结束时间
      DB_ADDRESS[k].pr=subOrder.pr||0;                     // 价格
      DB_ADDRESS[k].pd=subOrder.pd||'';                    // 付款日期
      DB_ADDRESS[k].pa=subOrder.pa||'';                    // 付款账号
      DB_ADDRESS[k].pm=subOrder.pm||0;                     // 收款金额
      DB_ADDRESS[k].cs=subOrder.cost||200;                 // 成本
      DB_ADDRESS[k].rk=subOrder.rk||'';                    // 备注
      return true; // 同步成功
    }
  }
  return false; // 未找到对应地址
}
// 根据子订单状态更新母订单进度（与 getProgress 逻辑一致）
function updateParentOrderStatus(parentOrder, silent){
  if(!parentOrder||!parentOrder.items)return;
  sumOrder(parentOrder);
  if(parentOrder.pm_total<parentOrder.pr_total){parentOrder.pg='跟进中';return;}
  for(var ai=0;ai<parentOrder.items.length;ai++){
    var git=parentOrder.items[ai];
    var subPay=0;
    var subRecs=git.pr_records||[];
    for(var ap=0;ap<subRecs.length;ap++){if(subRecs[ap].pf)subPay+=(subRecs[ap].pm||0);}
    if(subRecs.length===0)subPay=(git.pm||0);
    if(subPay<=0||subPay<(git.pr||0)){parentOrder.pg='跟进中';return;}
  }
  if(parentOrder.pg!=='已办结'){parentOrder.pg='已办结';if(!silent)toast(parentOrder.bn+' 已自动设为已办结');}
}

// 清空地址表中的订单信息（子订单删除时调用）
function clearAddressOrderInfo(addrStr){
  if(!addrStr)return;
  for(var k=0;k<DB_ADDRESS.length;k++){
    var va=DB_ADDRESS[k];
    var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
    if(fullAddr===addrStr){
      // 清空所有订单相关字段
      DB_ADDRESS[k].bn='';
      DB_ADDRESS[k].co='';
      DB_ADDRESS[k].sl='';
      DB_ADDRESS[k].ac='';
      DB_ADDRESS[k].nn='';
      DB_ADDRESS[k].rt='';
      DB_ADDRESS[k].ph='';
      DB_ADDRESS[k].lp='';
      DB_ADDRESS[k].sd='';
      DB_ADDRESS[k].ed='';
      DB_ADDRESS[k].pr=0;
      DB_ADDRESS[k].pd='';
      DB_ADDRESS[k].pa='';
      DB_ADDRESS[k].pm=0;
      DB_ADDRESS[k].cs=0;
      DB_ADDRESS[k].rk='';
      return true;
    }
  }
  return false;
}

// 检查地址是否已被占用（存在于地址表且bn非空），excludeAddr为排除的地址（当前子订单自身地址）
function isAddrOccupied(addrStr, excludeAddr){
  var addr=(addrStr||'').trim();
  if(!addr)return false;
  if(addr===excludeAddr)return false; // 排除当前子订单已有的地址
  for(var k=0;k<DB_ADDRESS.length;k++){
    var va=DB_ADDRESS[k];
    var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
    if(fullAddr===addr && va.bn && va.bn!==''){
      return true; // 地址存在且已占用
    }
  }
  return false; // 地址不存在或为空置
}

// ★★★ 检查地址是否在空置地址列表中 ★★★
function isAddrVacant(addrStr){
  var addr=(addrStr||'').trim();
  if(!addr)return false;
  for(var k=0;k<DB_ADDRESS.length;k++){
    var va=DB_ADDRESS[k];
    var fullAddr=[(va.ad||'').trim(),(va.rm||'').trim()].filter(function(x){return x}).join('');
    if(fullAddr===addr && (!va.bn || va.bn==='')){
      return true; // 地址存在且为空置
    }
  }
  return false; // 地址不存在或已被占用
}

function toggleSubAddrOther(val){
  var wrap=document.getElementById('addr-other-wrap');
  if(wrap)wrap.style.display=val==='__other__'?'':'none';
}
// 选择地址时自动填充单位名称、联系电话、法人（用于select方式）
function onSubAddrChange(sel){
  var val=sel.value;
  if(val && val!=='__other__'){
    var opt=sel.options[sel.selectedIndex];
    var co=opt.getAttribute('data-co')||'';
    var ph=opt.getAttribute('data-ph')||'';
    var lp=opt.getAttribute('data-lp')||'';
    var coInput=document.getElementById('sub-co');
    var phInput=document.getElementById('sub-ph');
    var lpInput=document.getElementById('sub-lp');
    if(coInput&&!coInput.value)coInput.value=co;
    if(phInput&&!phInput.value)phInput.value=ph;
    if(lpInput&&!lpInput.value)lpInput.value=lp;
  }
}
// 地址输入框变化时自动填充（编辑子订单弹窗用）
function onEditAddrInputChange(input){
  var val=input.value.trim();
  if(val){
    var selOpt=document.querySelector('#edit-addr-select option[value="'+val.replace(/"/g,'\\"')+'"]');
    if(selOpt){
      var co=selOpt.getAttribute('data-co')||'';
      var coInput=document.getElementById('edit-sub-co');
      if(coInput&&!coInput.value)coInput.value=co;
    }
  }
}
// 地址输入框变化时自动填充（添加子订单弹窗用，input+datalist方式）
function onSubAddrInputChange(input){
  var val=input.value.trim();
  if(val){
    // 从隐藏的select中查找匹配的option
    var selOpt=document.querySelector('#sub-addr-select option[value="'+val.replace(/"/g,'\\"')+'"]');
    if(selOpt){
      var co=selOpt.getAttribute('data-co')||'';
      var ph=selOpt.getAttribute('data-ph')||'';
      var lp=selOpt.getAttribute('data-lp')||'';
      var coInput=document.getElementById('sub-co');
      var phInput=document.getElementById('sub-ph');
      var lpInput=document.getElementById('sub-lp');
      if(coInput&&!coInput.value)coInput.value=co;
      if(phInput&&!phInput.value)phInput.value=ph;
      if(lpInput&&!lpInput.value)lpInput.value=lp;
    }
  }
}

function openOrderModal(d,prefill){
  var isEdit=!!d;
  var pf=prefill||{};
  // 提前保存当前编辑的母订单ID，供子订单添加按钮使用
  _currentEditingOrderId=d?d.id:null;

  // 1. 业务员选项：admin/neiqin可选所有，销售只能选自己
  // 默认选中当前用户
  var defaultSales=curUser.name;
  var salesOpts='<option value="">请选择</option>';
  if(curUser.role==='admin'||curUser.role==='neiqin'){
    // 从 DB_USERS 动态获取销售员列表
    var salesList=DB_USERS.filter(function(u){return u.role==='sales'}).map(function(u){return u.name});
    for(var si=0;salesList&&si<salesList.length;si++){
      // 新增订单时默认选中当前用户，编辑时选中订单的业务员
      var isSelected=d?(d.sl===salesList[si]):(salesList[si]===defaultSales);
      salesOpts+='<option value="'+esc(salesList[si])+'"'+(isSelected?' selected':'')+'>'+esc(salesList[si])+'</option>';
    }
  } else {
    // 销售角色只能选择自己，默认选中
    salesOpts='<option value="'+esc(curUser.name)+'" selected>'+esc(curUser.name)+'</option>';
  }

  // 2. 对接账号选项：根据所选业务员的对接账号
  // 获取当前选中的业务员（编辑时用订单的，新增时用当前用户）
  var selectedSales=d?d.sl:defaultSales;
  var selectedSalesUser=DB_USERS.find(function(u){return u.name===selectedSales});
  var myAccounts=[];
  if(selectedSalesUser&&selectedSalesUser.account){
    myAccounts=selectedSalesUser.account.split(',').map(function(a){return a.trim()}).filter(function(a){return a});
  }
  myAccounts.sort();
  var accountOpts='<option value="">请选择</option>';
  for(var k=0;k<myAccounts.length;k++){
    accountOpts+='<option value="'+esc(myAccounts[k])+'"'+(d&&d.ac===myAccounts[k]?' selected':'')+'>'+esc(myAccounts[k])+'</option>';
  }

  // 3. 客户昵称选项：根据所选业务员的姓名筛选客户
  var selSales=d?(d.sl||''):defaultSales;
  var custOpts='';
  var myCusts=[];
  for(var ci=0;ci<DB_CUSTOMERS.length;ci++){
    var c=DB_CUSTOMERS[ci];
    // 客户属于当前业务员（按业务员姓名匹配），或者是编辑时保留原客户
    var isMyCust=c.sl===selSales;
    if(isMyCust||(d&&d.nn===c.nn)){
      myCusts.push(c);
      custOpts+='<option value="'+esc(c.nn)+'" data-wx="'+esc(c.wx||'')+'" data-ct="'+esc(c.tp||'')+'" data-ac="'+esc(c.ac||'')+'" data-phone="'+esc(c.phone||'')+'"'+(d&&d.nn===c.nn?' selected':'')+'>'+esc(c.nn)+'</option>';
    }
  }

  // 4. 自动生成业务编号
  var autoBn=d?(d.bn||''):'';
  if(!autoBn&&!isEdit){
    // 从现有订单获取最大编号（按业务员分组）
    var maxNum=0;
    var now=new Date();
    // 取业务员的英文缩写 code，没有则用姓名的拼音首字母
    var salesUser=DB_USERS.find(function(u){return u.name===selectedSales;});
    var prefixCode=salesUser&&salesUser.code?salesUser.code:(selectedSales.charAt(0));
    var prefix=prefixCode+'-'+now.getFullYear();
    for(var oi=0;oi<DB_ORDERS.length;oi++){
      var bn=DB_ORDERS[oi].bn||'';
      if(bn.indexOf(prefix)===0){
        var num=parseInt(bn.replace(prefix,''));
        if(num>maxNum)maxNum=num;
      }
    }
    autoBn=prefix+String(maxNum+1).padStart(3,'0');
  }

  // 5. 内勤选项
  var nqOpts='<option value="">请选择</option>';
  // 从 DB_USERS 动态获取内勤列表
  var nqList=DB_USERS.filter(function(u){return u.role==='neiqin'}).map(function(u){return u.name});
  for(var ni=0;nqList&&ni<nqList.length;ni++){
    nqOpts+='<option value="'+esc(nqList[ni])+'"'+(d&&d.nq===nqList[ni]?' selected':'')+'>'+esc(nqList[ni])+'</option>';
  }

  var body='<form id="of"><div class="form-grid">'
    +'<input type="hidden" name="bt" value="地址销售"/>'
    +'<div class="form-group"><label>订单时间</label><input type="date" name="od" value="'+(d?d.od||todayStr():todayStr())+'"/></div>'
    +'<div class="form-group"><label>业务员*</label><select name="sl" id="of-sl" onchange="onOrderSalesChange(this.value)">'+salesOpts+'</select></div>'
    +'<div class="form-group"><label>对接账号</label><select name="ac" id="of-ac" onchange="onOrderAccountChange(this.value)">'+accountOpts+'</select></div>'
    +'<div class="form-group"><label>业务编号</label><input name="bn" id="of-bn" value="'+esc(autoBn)+'"'+(isEdit?' data-isEdit="true"':'')+'/></div>'
    +'<div class="form-group"><label>客户昵称</label><select name="nn" id="of-nn" onchange="onOrderCustChange(this)"><option value="">请选择</option>'+custOpts+'</select></div>'
    +'<div class="form-group"><label>微信</label><input name="wx" id="of-wx" value="'+esc(d?d.wx:pf.wx||'')+'"/></div>'
    +'<div class="form-group"><label>客户类型</label><select name="ct" id="of-ct"><option value="新客户">新客户</option><option value="老客户">老客户</option></select></div>'
    +'<div class="form-group"><label>联系电话</label><input name="phone" id="of-phone" value="'+esc(d?d.phone:pf.phone||'')+'"/></div>'
    +'<div class="form-group"><label>内勤</label><select name="nq">'+nqOpts+'</select></div>'
    +'<div class="form-group"><label>进度</label><select name="pg"><option value="跟进中"'+(d&&d.pg==='跟进中'?' selected':'')+'>跟进中</option><option value="待处理"'+(d&&d.pg==='待处理'?' selected':'')+'>待处理</option><option value="已办结"'+(d&&d.pg==='已办结'?' selected':'')+'>已办结</option></select></div>'
    +'<div class="form-group full"><label>备注</label><textarea name="rk">'+esc(d?d.rk:pf.rk||'')+'</textarea></div>'
    +'</div>'
    +(isEdit?'':'<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px;padding-top:12px;border-top:2px solid #e5e7eb">'
    +'<strong style="font-size:14px;color:#374151">子订单明细</strong>'
    +'<button type="button" class="btn-primary" style="padding:4px 12px;font-size:12px" onclick="addSubOrderFromEdit('+(_currentEditingOrderId||'null')+')">+ 添加子订单</button>'
    +'</div>'
    +'<div id="order-items-list"></div>')
    +'</form>';

  // 编辑时设置客户类型
  if(d&&d.ct){
    var ctSel=document.getElementById('of-ct');
    setTimeout(function(){
      var opts=ctSel.options;
      for(var i=0;i<opts.length;i++){
        if(opts[i].value===d.ct){opts[i].selected=true;break;}
      }
    },0);
  }

  showModal(isEdit?'编辑订单':'新增订单',body,function(){
    var f=getFormData('of');
    // 必填验证：业务员、客户昵称必须填写
    if(!f.bt){f.bt='地址销售';}
    if(!f.sl){toast('请选择业务员','error');return;}
    if(!f.nn){toast('请选择客户昵称','error');return;}
    var items=[];
    var rows=document.querySelectorAll('#order-items-list .order-item-row');
    // 编辑时保留原始子订单数据（子订单明细只能通过编辑按钮修改，不从此表单读取）
    var items=(d&&d.items&&isEdit)?d.items:[];
    // 新增时从DOM读取（新增的子订单通过"+ 添加子订单"按钮添加，仍可编辑）
    if(!isEdit){
      for(var i=0;i<rows.length;i++){
        var r=rows[i];
        var it={
          co:r.querySelector('[name^="i_co"]')?r.querySelector('[name^="i_co"]').value:'',
          addr:r.querySelector('[name^="i_addr"]')?r.querySelector('[name^="i_addr"]').value:'',
          rt:r.querySelector('[name^="i_rt"]')?r.querySelector('[name^="i_rt"]').value:'',
          pr:parseFloat(r.querySelector('[name^="i_pr"]')&&r.querySelector('[name^="i_pr"]').value)||0,
          sd:r.querySelector('[name^="i_sd"]')?r.querySelector('[name^="i_sd"]').value:'',
          ed:r.querySelector('[name^="i_ed"]')?r.querySelector('[name^="i_ed"]').value:'',
          pd:r.querySelector('[name^="i_pd"]')?r.querySelector('[name^="i_pd"]').value:'',
          pa:r.querySelector('[name^="i_pa"]')?r.querySelector('[name^="i_pa"]').value:'',
          pm:parseFloat(r.querySelector('[name^="i_pm"]')&&r.querySelector('[name^="i_pm"]').value)||0,
          cost:parseFloat(r.querySelector('[name^="i_cost"]')&&r.querySelector('[name^="i_cost"]').value)||200
        };
        items.push(it);
      }
    }
    delete f.items;f.items=items;sumOrder(f);
    if(isEdit){
      // 如果有新的子订单加入，重置母订单状态
      if(items&&items.length>(d.items||[]).length){for(var pi=0;pi<DB_ORDERS.length;pi++){if(DB_ORDERS[pi].id===d.id){DB_ORDERS[pi].pg='跟进中';break}}}
      for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].id===d.id)DB_ORDERS[i]=Object.assign(DB_ORDERS[i],f,{pm_total:f.pm_total,cost_total:f.cost_total,profit_total:f.profit_total})}
    }
    else{f.id=Date.now();DB_ORDERS.push(f)}
    // 快速续费：创建新母订单后自动添加续费子订单
    if(!isEdit&&window._quickRenewData){
      var qrd=window._quickRenewData;window._quickRenewData=null;
      var addrRecord=null;
      for(var qi=0;qi<DB_ADDRESS.length;qi++){if(DB_ADDRESS[qi].id===qrd.addrId){addrRecord=DB_ADDRESS[qi];break}}
      if(addrRecord&&f.items){
        var lastOrder=DB_ORDERS[DB_ORDERS.length-1];
        var newSubBn=lastOrder.bn+'-01';
        if(lastOrder.items&&lastOrder.items.length>0){
          var mx=0;for(var si=0;si<lastOrder.items.length;si++){var sn=parseInt((lastOrder.items[si].subBn||'').replace(lastOrder.bn+'-',''));if(sn>mx)mx=sn}
          newSubBn=lastOrder.bn+'-'+String(mx+1).padStart(2,'0');
        }
        var pft=(qrd.pm||0)-(addrRecord.cs||200);
        lastOrder.items.push({addr:(addrRecord.ad||'')+(addrRecord.rm||''),rt:addrRecord.rt,sd:qrd.newSd||addrRecord.ed,ed:qrd.newEd,pr:qrd.pm,pd:todayStr(),pa:addrRecord.pa||'',pm:qrd.pm,cost:addrRecord.cs||200,bt:'renew',xd:'',xa:'',xt:'',xm:0,profit:pft,co:addrRecord.co||'',subBn:newSubBn});
        addrRecord.sd=qrd.newSd||addrRecord.ed;addrRecord.ed=qrd.newEd;addrRecord.pm=qrd.pm;if(qrd.rk)addrRecord.rk=qrd.rk;addrRecord.rd=daysBetween(qrd.newEd);addrRecord.rs=addrRecord.rd<=90?'需要续费':'无需续费';
        // 回写子订单 ed
        if(addrRecord){
          var ca=((addrRecord.ad||'')+(addrRecord.rm||'')).trim();
          for(var oi=0;oi<DB_ORDERS.length;oi++){
            var o=DB_ORDERS[oi];
            if(o.items){for(var ii=0;ii<o.items.length;ii++){var it=o.items[ii];if(it.addr&&it.addr.replace(/\s+/g,'')===ca.replace(/\s+/g,'')){it.sd=qrd.newSd||it.sd;it.ed=qrd.newEd}}}
          }
        }
        toast('续费成功!');
      }
    }
    syncAll();
    if(!isEdit&&window._quickRenewAddrId){
      // 来自选择弹窗：只关闭订单弹窗，恢复底下的快速续费弹窗，再打开选择弹窗
      var aid=window._quickRenewAddrId;window._quickRenewAddrId=null;
      toast('已添加');
      closeModal(); // 关闭订单弹窗，恢复快速续费弹窗
      // 弹窗恢复需要一点时间，延迟后打开选择弹窗
      setTimeout(function(){openOrderSelectPopup(aid);},100);
    }else{
      toast(isEdit?'已更新':'已添加');closeAllModals();renderOrdersTable();
    }
  });
  // 初始化子订单
  window._orderItemIdx=0;
  // 新增订单时默认空白，不添加默认地址；编辑时保留原有地址
  var initItems=(d&&d.items&&isEdit)?d.items:[];
  for(var i=0;i<initItems.length;i++)addOrderItem(initItems[i]);
}

// 选择业务员后更新对接账号和客户下拉
function onOrderSalesChange(salesName){
  var acSel=document.getElementById('of-ac');
  var custSel=document.getElementById('of-nn');
  if(!acSel)return;
  
  // 获取所选业务员的对接账号
  var salesUser=DB_USERS.find(function(u){return u.name===salesName});
  var accounts=[];
  if(salesUser&&salesUser.account){
    accounts=salesUser.account.split(',').map(function(a){return a.trim()}).filter(function(a){return a});
  }
  
  // 更新对接账号下拉
  var acOpts='<option value="">请选择</option>';
  for(var i=0;i<accounts.length;i++){
    acOpts+='<option value="'+esc(accounts[i])+'">'+esc(accounts[i])+'</option>';
  }
  acSel.innerHTML=acOpts;
  
  // 更新客户下拉（根据该业务员的姓名）
  if(custSel){
    var custOpts='<option value="">请选择</option>';
    for(var ci=0;ci<DB_CUSTOMERS.length;ci++){
      var c=DB_CUSTOMERS[ci];
      // 按业务员姓名筛选客户
      if(c.sl===salesName){
        custOpts+='<option value="'+esc(c.nn)+'" data-wx="'+esc(c.wx||'')+'" data-ct="'+esc(c.tp||'')+'" data-ac="'+esc(c.ac||'')+'" data-phone="'+esc(c.phone||'')+'">'+esc(c.nn)+'</option>';
      }
    }
    custSel.innerHTML=custOpts;
  }
  
  // 清空关联字段
  var wxEl=document.getElementById('of-wx');
  var ctEl=document.getElementById('of-ct');
  var phoneEl=document.getElementById('of-phone');
  if(wxEl)wxEl.value='';
  if(ctEl)ctEl.value='新客户';
  if(phoneEl)phoneEl.value='';
  
  // ★ 切换业务员时同步更新订单编号（仅新增时）
  var bnInput=document.getElementById('of-bn');
  if(bnInput && !bnInput.dataset.isEdit){
    var now=new Date();
    var salesUser2=DB_USERS.find(function(u){return u.name===salesName});
    var prefixCode=salesUser2&&salesUser2.code?salesUser2.code:(salesName?salesName.charAt(0):'');
    if(prefixCode){
      var prefix=prefixCode+'-'+now.getFullYear();
      var maxNum=0;
      for(var oi=0;oi<DB_ORDERS.length;oi++){
        var bn=DB_ORDERS[oi].bn||'';
        if(bn.indexOf(prefix)===0){
          var num=parseInt(bn.replace(prefix,''));
          if(num>maxNum)maxNum=num;
        }
      }
      bnInput.value=prefix+String(maxNum+1).padStart(3,'0');
    }
  }
}

// 选择对接账号后只清空关联字段（客户已按业务员固定筛选）
function onOrderAccountChange(ac){
  // 清空关联字段
  var wxEl=document.getElementById('of-wx');
  var ctEl=document.getElementById('of-ct');
  var phoneEl=document.getElementById('of-phone');
  if(wxEl)wxEl.value='';
  if(ctEl)ctEl.value='新客户';
  if(phoneEl)phoneEl.value='';
}

// 选择客户后自动填充信息
function onOrderCustChange(sel){
  var opt=sel.options[sel.selectedIndex];
  var wxEl=document.getElementById('of-wx');
  var ctEl=document.getElementById('of-ct');
  var phoneEl=document.getElementById('of-phone');
  var acEl=document.getElementById('of-ac');
  if(opt&&opt.value){
    if(wxEl)wxEl.value=opt.dataset.wx||'';
    if(ctEl){
      var ctOpts=ctEl.options;
      for(var i=0;i<ctOpts.length;i++){
        if(ctOpts[i].value===opt.dataset.ct){ctOpts[i].selected=true;break;}
        if(i===ctOpts.length-1)ctOpts[0].selected=true;
      }
    }
    if(phoneEl)phoneEl.value=opt.dataset.phone||'';
  }
}
function addOrderItem(data){
  var idx=window._orderItemIdx||0;window._orderItemIdx=idx+1;
  var d=data||{};
  var statusMap={draft:'',pending:'待审批',approved:'已通过',rejected:'已驳回'};
  var itemStatus=d.itemStatus||'draft';
  var statusTag=itemStatus==='draft'?'tag-gray':itemStatus==='pending'?'tag-orange':itemStatus==='approved'?'tag-green':'tag-red';
  var statusText=statusMap[itemStatus]||'';
  
  // 获取支出记录信息并分类统计
  var expRecords=d.xr||[];
  var confirmedExp=0; // 已确认支出
  var pendingExp=0;   // 待确认支出
  var rejectedExp=0;  // 已驳回支出
  var lastRejectNote=''; // 最后一条驳回备注
  for(var ri=0;ri<expRecords.length;ri++){
    var rec=expRecords[ri];
    if(rec.xf){ // 已确认
      confirmedExp+=(parseFloat(rec.xm)||0);
    } else if(rec.xrej){ // 已驳回
      rejectedExp+=(parseFloat(rec.xm)||0);
      lastRejectNote=rec.xrej;
    } else { // 待确认
      pendingExp+=(parseFloat(rec.xm)||0);
    }
  }
  
  // 获取支付方式详情
  var methodMap={wechat:'微信二维码',alipay_qr:'支付宝二维码',alipay_account:'支付宝账号',bank:'对公账号'};
  var payDetailText='';
  if(d.xp){
    payDetailText=methodMap[d.xp]||d.xp;
    if(expRecords.length>0){
      var lastRec=expRecords[expRecords.length-1];
      var pDetail={};
      try{pDetail=lastRec.xb?JSON.parse(lastRec.xb):{};}catch(e){pDetail={};}
      if(d.xp==='alipay_account'&&pDetail.alipayAccount){
        payDetailText+=' ('+pDetail.alipayAccount+')';
      }else if(d.xp==='bank'&&pDetail.bankAccount){
        payDetailText+=' ('+pDetail.bankAccount+')';
      }
    }
  }
  
  // 计算收益（使用已确认支出）
  var profit=(d.pm||0)-confirmedExp-(d.cost||200);
  
  // 生成支出记录列表HTML
  var expRecordsHtml='';
  if(expRecords.length>0){
    var recListItems='';
    for(var ri=0;ri<expRecords.length;ri++){
      var rec=expRecords[ri];
      var recStatus=rec.xf?'已确认':rec.xrej?'已驳回':'待确认';
      var statusClass=rec.xf?'tag-green':rec.xrej?'tag-red':'tag-orange';
      var recAmount='¥'+(parseFloat(rec.xm)||0).toFixed(2);
      var recDate=rec.xf||rec.xd||'-';
      var recRemark=rec.xrej||rec.rk||'';
      recListItems+='<tr style="border-bottom:1px solid #e5e7eb">'
        +'<td style="padding:6px 8px;font-size:12px">'+(ri+1)+'</td>'
        +'<td style="padding:6px 8px;font-size:12px">'+esc(recDate)+'</td>'
        +'<td style="padding:6px 8px;font-size:12px;color:#dc2626;font-weight:600">'+recAmount+'</td>'
        +'<td style="padding:6px 8px;font-size:12px"><span class="'+statusClass+'">'+recStatus+'</span></td>'
        +'<td style="padding:6px 8px;font-size:12px;color:#666">'+(recRemark?esc(recRemark):'-')+'</td>'
        +'</tr>';
    }
    expRecordsHtml='<div style="margin-top:8px">'
      +'<div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">支出明细（共'+expRecords.length+'条）</div>'
      +'<table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:4px">'
      +'<thead><tr style="background:#e5e7eb"><th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280">#</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280">时间</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280">金额</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280">状态</th><th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280">备注</th></tr></thead>'
      +'<tbody>'+recListItems+'</tbody>'
      +'</table>'
      +'</div>';
  }
  
  var html='<div class="order-item-row" data-idx="'+idx+'" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;background:#f9fafb">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    +'<span style="font-size:13px;font-weight:600;color:#374151">'
    +'<span class="order-bn-tag" style="font-size:11px">'+esc(d.subBn||'')+'</span> '
    +'子订单 #'+(idx+1)
    +' '+(statusText?'<span class="tag-'+statusTag.replace('tag-','')+'" style="margin-left:6px">'+statusText+'</span>':'')+'</span>'
    +'<div style="display:flex;gap:8px;align-items:center">'
    +'<button type="button" class="btn-edit" style="padding:4px 10px;font-size:12px" onclick="openSubOrderEditFromModal('+idx+')">编辑</button>'
    +'<button type="button" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px" onclick="this.closest(\'.order-item-row\').remove()">×</button>'
    +'</div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">'
    +'<div style="grid-column:1/-1"><label style="font-size:12px;color:#6b7280">单位名称</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.co||'-')+'</div></div>'
    +'<div style="grid-column:1/-1"><label style="font-size:12px;color:#6b7280">地址</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.addr||'-')+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">注册类型</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.rt||'-')+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">联系电话</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.ph||'-')+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">法人</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.lp||'-')+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">报价</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+fmtM(d.pr||0)+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">开始时间</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.sd||'-')+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">结束时间</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.ed||'-')+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">收款时间</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.pd||'-')+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">收款账号</label><div style="padding:6px 8px;font-size:13px;color:#333;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+esc(d.pa||'-')+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">收款金额</label><div style="padding:6px 8px;font-size:13px;color:#059669;font-weight:600;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+fmtM(d.pm||0)+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">成本</label><div style="padding:6px 8px;font-size:13px;color:#dc2626;background:#fff;border:1px solid #e5e7eb;border-radius:4px;min-height:30px">'+fmtM(d.cost||200)+'</div></div>'
    +'<div><label style="font-size:12px;color:#6b7280">支付方式</label><span style="display:inline-block;padding:6px 0;color:#666">'+(payDetailText||'-')+'</span></div>'
    +'<div><label style="font-size:12px;color:#6b7280">总支出金额</label><span style="display:inline-block;padding:6px 0;color:#dc2626;font-weight:600">'+(confirmedExp>0?'¥'+confirmedExp.toFixed(2):'-')+'</span></div>'
    +'</div>'
    // 支出汇总信息展示区
    +'<div style="margin-top:8px;padding:8px;background:#fff;border-radius:4px;border:1px solid #e5e7eb">'
    +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px">'
    +'<div><span style="color:#6b7280">已确认支出：</span><span style="color:#dc2626;font-weight:600">¥'+(confirmedExp||0).toFixed(2)+'</span></div>'
    +'<div><span style="color:#6b7280">待确认支出：</span><span style="color:#f59e0b">'+(pendingExp>0?'¥'+pendingExp.toFixed(2):'-')+'</span></div>'
    +'<div><span style="color:#6b7280">已驳回支出：</span><span style="color:#999">'+(rejectedExp>0?'¥'+rejectedExp.toFixed(2):'-')+'</span></div>'
    +'<div><span style="color:#6b7280">收益：</span><span style="color:#059669;font-weight:600">¥'+(profit||0).toFixed(2)+'</span></div>'
    +'</div>'
    +(lastRejectNote?'<div style="margin-top:6px;font-size:12px"><span style="color:#6b7280">驳回备注：</span><span style="color:#dc2626">'+esc(lastRejectNote)+'</span></div>':'')
    +expRecordsHtml
    +'</div></div>';
  var list=document.getElementById('order-items-list');
  if(list)list.insertAdjacentHTML('beforeend',html);
}

function renderCustomerTable(){
  var kw=$('customer-search').value.toLowerCase(),ft=$('customer-filter-type').value;
  var data=DB_CUSTOMERS.filter(function(c){
    // 销售员数据隔离：只能看到自己账号（ac）匹配的客户
    if(curRole==='sales'){
      if(!curUser.account)return false;
      var myAccts=curUser.account.split(',').map(function(a){return a.trim()});
      if(myAccts.indexOf(c.ac)===-1)return false;
    }
    if(ft&&c.tp!==ft)return false;
    if(kw){var s=(c.co+c.nn+c.wx+(c.sl||'')).toLowerCase();return s.indexOf(kw)!==-1}
    return true;
  });
  data=applyTableFilter(data,_custFilters,_custSort,_custCtx);
  updateHeaderIndicators($('customers-tbody').parentNode,_custFilters,_custSort);
  var total=data.length,tp=Math.ceil(total/PS)||1;if(cp>tp)cp=tp;var pd=data.slice((cp-1)*PS,cp*PS);
  var tt={'\u65b0\u5ba2\u6237':'tag-purple','\u8001\u5ba2\u6237':'tag-gray'};var tb=$('customers-tbody'),html='';
  // 判断当前用户是否可以操作某客户
  function canOperate(c){
    if(curUser.role==='admin'||curUser.role==='gm')return true;
    if(!curUser.account)return false;
    var myAccounts=curUser.account.split(',').map(function(a){return a.trim()});
    return myAccounts.indexOf(c.ac)!==-1;
  }
  for(var i=0;i<pd.length;i++){var c=pd[i];
    // 计算该客户的订单汇总
    var oc=0,totalPm=0,totalPr=0,totalUnpaid=0;
    for(var j=0;j<DB_ORDERS.length;j++){
      var o=DB_ORDERS[j];
      if(o.nn===c.nn){
        oc++;
        sumOrder(o);
        totalPm+=o.pm_total||0;
        totalPr+=o.pr_total||0;
        totalUnpaid+=Math.max((o.pr_total||0)-(o.pm_total||0),0);
      }
    }
    var unpaid=totalUnpaid;
    var actionHtml=canOperate(c)?'<button class="btn-edit" onclick="editCust('+c.id+')">编辑</button><button class="btn-sm" onclick="showCustFollowups('+c.id+')" style="background:#8b5cf6;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px">跟进</button><button class="btn-danger" onclick="delCust('+c.id+')">删除</button>':'<span style="color:#999">-</span>';
    html+='<tr><td style="text-align:center;color:#888;font-size:12px">'+((cp-1)*PS+i+1)+'</td><td>'+esc(c.nn)+'</td><td title="'+esc(c.co)+'">'+esc(c.co)+'</td><td>'+esc(c.wx)+'</td><td>'+esc(c.phone||'-')+'</td><td>'+esc(c.ac)+'</td><td>'+esc(c.sl||'-')+'</td><td>'+esc(c.fd)+'</td><td><span class="'+(tt[c.tp]||'tag-gray')+'">'+esc(c.tp)+'</span></td>'
      +'<td style="font-size:11px">'+(c.tags?renderCustTags(c.tags):'<span style="color:#ccc">-</span>')+'</td>'
      +'<td><a href="#" onclick="showCustomerOrders(\''+esc(c.nn).replace(/'/g,"\\'")+'\');return false" style="color:var(--blue);text-decoration:underline;font-weight:600">'+oc+'单</a></td>'
      +'<td class="num-income">'+fmtM(totalPm)+'</td>'
      +'<td class="num-cost">'+(unpaid>0?fmtM(unpaid):'<span style="color:#999">-</span>')+'</td>'
      +'<td class="td-actions">'+actionHtml+'</td></tr>'}
  tb.innerHTML=html||'<tr><td colspan="14" class="empty-state"><p>暂无</p></td></tr>';
  buildPg($('customers-pagination'),tp,cp,function(p){cp=p;renderCustomerTable()});
}
// 渲染客户标签（彩色小标签）
function renderCustTags(tagsStr){
  if(!tagsStr)return '<span style="color:#ccc">-</span>';
  var tags=tagsStr.split(',').map(function(t){return t.trim()}).filter(function(t){return t});
  var palettes=['#e0f2fe','#dcfce7','#fef3c7','#fce7f3','#e0e7ff','#f3e8ff','#ffe4e6','#d1fae5'];
  return tags.map(function(t,i){return '<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;background:'+palettes[i%palettes.length]+';color:#333;margin:1px">'+esc(t)+'</span>'}).join(' ');
}
function showCustomerOrders(nn){
  // 查找该客户的所有关联订单
  var related=[];
  for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].nn===nn)related.push(DB_ORDERS[i])}
  if(related.length===0){toast('该客户暂无关联订单','info');return}
  // 汇总数据
  var totalPm=0,totalPr=0,totalCost=0,totalExp=0,totalProfit=0,salesCount=0,renewCount=0;
  for(var i=0;i<related.length;i++){
    var o=related[i];
    sumOrder(o);
    totalPm+=o.pm_total||0;
    totalPr+=o.pr_total||0;
    totalCost+=o.cost_total||0;
    totalExp+=o.exp_total||0;
    totalProfit+=o.profit_total||0;
    if(o.bt==='地址续费'||o.bt==='renew')renewCount++;else salesCount++;
  }
  var unpaid=0;
  for(var ui=0;ui<related.length;ui++){sumOrder(related[ui]);unpaid+=Math.max((related[ui].pr_total||0)-(related[ui].pm_total||0),0)}
  var pgTag={'已办结':'tag-green','跟进中':'tag-blue','待处理':'tag-gray'};
  var btTag={'地址续费':'tag-green','renew':'tag-green'};
  var h='<div class="order-detail" onclick="event.stopPropagation()" style="max-width:900px">'
    +'<div class="order-detail-header"><h3>📋 客户订单汇总 - '+esc(nn)+'</h3><button class="order-detail-close" onclick="this.closest(\'.order-detail-overlay\').remove()">&times;</button></div>'
    +'<div class="order-detail-body">'
    // 汇总统计卡片
    +'<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px">'
    +'<div class="stat-card blue" style="margin:0;padding:16px"><div class="stat-icon">📦</div><div><div class="stat-value">'+related.length+'单</div><div class="stat-label" style="margin-top:2px">'+(salesCount>0?salesCount+'销售 ':'')+(renewCount>0?renewCount+'续费':'')+'</div></div></div>'
    +'<div class="stat-card green" style="margin:0;padding:16px"><div class="stat-icon">💰</div><div><div class="stat-value">'+fmtM(totalPm)+'</div><div class="stat-label" style="margin-top:2px">总收款</div></div></div>'
    +'<div class="stat-card orange" style="margin:0;padding:16px"><div class="stat-icon">⏳</div><div><div class="stat-value num-exp">'+fmtM(unpaid)+'</div><div class="stat-label" style="margin-top:2px">未收款</div></div></div>'
    +'<div class="stat-card red" style="margin:0;padding:16px"><div class="stat-icon">📉</div><div><div class="stat-value num-cost">'+fmtM(totalExp)+'</div><div class="stat-label" style="margin-top:2px">总支出</div></div></div>'
    +'<div class="stat-card teal" style="margin:0;padding:16px"><div class="stat-icon">📈</div><div><div class="stat-value num-profit">'+fmtM(totalProfit)+'</div><div class="stat-label" style="margin-top:2px">总收益</div></div></div>'
    +'</div>'
    // 订单列表
    +'<div class="detail-section">订单列表（共'+related.length+'个）</div>'
    +'<div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th>订单日期</th><th>业务编号</th><th>业务员</th><th>类型</th><th>进度</th><th>报价</th><th>收款金额</th><th>未收款</th><th>支出</th><th>成本</th><th>收益</th><th>操作</th></tr></thead><tbody>';
  for(var i=0;i<related.length;i++){
    var o=related[i];
    sumOrder(o);
    var oup=Math.max((o.pr_total||0)-(o.pm_total||0),0);
    h+='<tr>'
      +'<td style="font-size:11px;color:#888">'+(o.od||'')+'</td>'
      +'<td><a href="#" onclick="showOrderDetail('+o.id+');return false" style="color:var(--blue);text-decoration:underline">'+esc(o.bn||'--')+'</a></td>'
      +'<td>'+esc(o.sl||'-')+'</td>'
      +'<td><span class="'+(btTag[o.bt]?'tag-green':'tag-blue')+'" style="font-size:10px">'+esc(o.bt)+'</span></td>'
      +'<td><span class="'+(pgTag[o.pg]||'tag-gray')+'" style="font-size:10px">'+esc(o.pg)+'</span></td>'
      +'<td class="num-income" style="font-size:11px">'+(o.pr_total?fmtM(o.pr_total):'-')+'</td>'
      +'<td class="num-income">'+fmtM(o.pm_total||0)+'</td>'
      +'<td class="num-exp">'+(oup>0?fmtM(oup):'<span style="color:#999">-</span>')+'</td>'
      +'<td class="num-cost">'+fmtM(o.exp_total||0)+'</td>'
      +'<td class="num-cost">'+fmtM(o.cost_total||0)+'</td>'
      +'<td class="num-profit">'+fmtM(o.profit_total)+'</td>'
      +'<td><button class="detail-btn" onclick="showOrderDetail('+o.id+')" style="padding:2px 6px;font-size:11px">详情</button></td>'
      +'</tr>';
  }
  h+='</tbody></table></div>'
    +'</div></div>';
  var overlay=document.createElement('div');overlay.className='order-detail-overlay';overlay.innerHTML=h;overlay.onclick=function(){overlay.remove()};document.body.appendChild(overlay);
}
function editCust(id){var c=null;for(var i=0;i<DB_CUSTOMERS.length;i++){if(DB_CUSTOMERS[i].id===id){c=DB_CUSTOMERS[i];break}}if(c)openCustModal(c)}
function checkWechatDuplicate(wx,excludeId){
  var errEl=document.getElementById('wx-error');
  if(!errEl)return;
  var exists=false;
  for(var i=0;i<DB_CUSTOMERS.length;i++){
    if(DB_CUSTOMERS[i].wx===wx&&(!excludeId||DB_CUSTOMERS[i].id!==excludeId)){
      exists=true;break;
    }
  }
  errEl.style.display=exists?'block':'none';
}
function delCust(id){confirmDialog('确认删除该客户？',function(){DB_CUSTOMERS=DB_CUSTOMERS.filter(function(x){return x.id!==id});syncAll();toast('已删除');renderCustomerTable()})}
function openCustModal(d){
  var isEdit=!!d;
  var custId=d?d.id:null;
  // 生成对接账号下拉选项：根据当前登录账号显示其对应的对接账号
  var myAccounts=[];
  // admin/gm 显示所有账号的对接账号，其他角色只显示自己的
  if(curUser.role==='admin'||curUser.role==='gm'){
    for(var ai=0;ai<DB_USERS.length;ai++){
      if(DB_USERS[ai].account){
        var accounts=DB_USERS[ai].account.split(',');
        for(var aj=0;aj<accounts.length;aj++){
          var acc=accounts[aj].trim();
          if(acc&&myAccounts.indexOf(acc)===-1){
            myAccounts.push(acc);
          }
        }
      }
    }
  } else if(curUser.account){
    myAccounts=curUser.account.split(',').map(function(a){return a.trim()}).filter(function(a){return a});
  }
  myAccounts.sort();
  var accountOpts='<option value="">-- 请选择 --</option>';
  for(var k=0;k<myAccounts.length;k++){
    accountOpts+='<option value="'+esc(myAccounts[k])+'"'+(d&&d.ac===myAccounts[k]?' selected':'')+'>'+esc(myAccounts[k])+'</option>';
  }
  // 生成业务员选项：admin/gm可选所有，其他角色只能选自己（默认当前用户）
  var salesOpts='<option value="">-- 请选择 --</option>';
  if(curUser.role==='admin'||curUser.role==='gm'){
    var salesList=DB_USERS.filter(function(u){return u.role==='sales'}).map(function(u){return u.name});
    for(var si=0;salesList&&si<salesList.length;si++){
      var isSelected=d?(d.sl===salesList[si]):(salesList[si]===curUser.name);
      salesOpts+='<option value="'+esc(salesList[si])+'"'+(isSelected?' selected':'')+'>'+esc(salesList[si])+'</option>';
    }
  } else {
    salesOpts='<option value="'+esc(curUser.name)+'" selected>'+esc(curUser.name)+'</option>';
  }
  showModal(isEdit?'编辑客户':'新增客户',
    '<form id="cf"><div class="form-grid"><div class="form-group"><label>公司名称</label><input name="co" value="'+esc(d?d.co:'')+'"/></div><div class="form-group"><label>昵称</label><input name="nn" value="'+esc(d?d.nn:'')+'"/></div><div class="form-group"><label>微信</label><input name="wx" id="cust-wechat" value="'+esc(d?d.wx:'')+'" onchange="checkWechatDuplicate(this.value,'+custId+')"/><div id="wx-error" style="color:#ef4444;font-size:12px;margin-top:4px;display:none">该微信号已存在，请勿重复添加</div></div><div class="form-group"><label>联系电话</label><input name="phone" value="'+esc(d?d.phone:'')+'" placeholder="请输入联系电话"/></div><div class="form-group"><label>标签</label><input name="tags" placeholder="\u9017\u53f7\u5206\u9694\uff0c\u5982:\u4ee3\u7406\u8bb0\u8d26,\u6ce8\u518c\u516c\u53f8" value="'+(d&&d.tags||'')+'"/></div><div class="form-group"><label>客户类型</label><select name="tp"><option value="新客户"'+(d&&d.tp==='新客户'?' selected':'')+'>新客户</option><option value="老客户"'+(d&&d.tp==='老客户'?' selected':'')+'>老客户</option></select></div><div class="form-group"><label>对接账号</label><select name="ac">'+accountOpts+'</select></div><div class="form-group"><label>业务员</label><select name="sl">'+salesOpts+'</select></div></div></form>',
    function(){var f=getFormData('cf');
      // 检查微信号唯一性
      var wxDuplicate=false;
      for(var i=0;i<DB_CUSTOMERS.length;i++){
        if(DB_CUSTOMERS[i].wx===f.wx&&(!isEdit||DB_CUSTOMERS[i].id!==custId)){
          wxDuplicate=true;break;
        }
      }
      if(wxDuplicate){toast('该微信号已存在，请勿重复添加','error');return}
      // 检查客户昵称唯一性
      var nnDuplicate=false;
      for(var i=0;i<DB_CUSTOMERS.length;i++){
        if(DB_CUSTOMERS[i].nn===f.nn&&(!isEdit||DB_CUSTOMERS[i].id!==custId)){
          nnDuplicate=true;break;
        }
      }
      if(nnDuplicate){toast('该客户昵称已存在，请勿重复添加','error');return}
      if(isEdit){for(var i=0;i<DB_CUSTOMERS.length;i++){if(DB_CUSTOMERS[i].id===custId)DB_CUSTOMERS[i]=Object.assign(DB_CUSTOMERS[i],f)}}
      else{f.id=Date.now();f.fd=todayStr();f.dy=0;if(!f.tp)f.tp='新客户';DB_CUSTOMERS.push(f)}
      syncAll();
      toast(isEdit?'已更新':'已添加');closeAllModals();renderCustomerTable();
    });
}
// 客户跟进记录
var FOLLOWUP_TYPES={call:'📞 电话',wechat:'💬 微信',visit:'🏢 拜访',note:'📝 备注'};
function showCustFollowups(custId){
  var c=null;
  for(var i=0;i<DB_CUSTOMERS.length;i++){if(DB_CUSTOMERS[i].id===custId){c=DB_CUSTOMERS[i];break}}
  if(!c){toast('客户不存在','error');return}
  renderCustFollowups(c);
}
function renderCustFollowups(c){
  var followups=c.followups||[];
  var typeOpts='';
  for(var k in FOLLOWUP_TYPES)typeOpts+='<option value="'+k+'">'+FOLLOWUP_TYPES[k]+'</option>';
  var listHtml='';
  if(followups.length===0){
    listHtml='<div style="text-align:center;padding:30px;color:#999;font-size:13px">暂无跟进记录</div>';
  }else{
    for(var i=followups.length-1;i>=0;i--){
      var f=followups[i];
      var typeLabel=FOLLOWUP_TYPES[f.type]||FOLLOWUP_TYPES.note;
      var userLabel=f.user?'<span style="color:#6b7280;font-size:11px"> · '+esc(f.user)+'</span>':'';
      listHtml+='<div style="display:flex;gap:12px;padding:12px 16px;border-left:2px solid #8b5cf6;margin-left:12px;position:relative">'
        +'<div style="width:8px;height:8px;border-radius:50%;background:#8b5cf6;position:absolute;left:-5px;top:16px;flex-shrink:0"></div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
        +'<span style="font-size:11px;background:#f3e8ff;color:#6d28d9;padding:1px 6px;border-radius:3px">'+typeLabel+'</span>'
        +'<span style="font-size:11px;color:#9ca3af">'+esc(f.ts)+'</span>'
        +userLabel
        +'</div>'
        +'<div style="font-size:12px;color:#374151;line-height:1.5">'+esc(f.content||'')+'</div>'
        +'</div></div>';
    }
  }
  showModal('跟进记录 - '+esc(c.nn)+' ('+esc(c.co)+')',
    '<div style="max-height:400px;overflow-y:auto;margin-bottom:16px">'+listHtml+'</div>'
    +'<div style="border-top:1px solid #e5e7eb;padding-top:12px">'
    +'<div class="form-grid" style="grid-template-columns:1fr">'
    +'<div class="form-group"><label>跟进方式</label><select id="fup-type">'+typeOpts+'</select></div>'
    +'<div class="form-group"><label>跟进内容</label><textarea id="fup-content" rows="3" placeholder="请输入跟进内容..." style="width:100%;padding:8px;border:1px solid var(--bd);border-radius:var(--r-sm);font-size:13px;resize:vertical"></textarea></div>'
    +'</div>'
    +'<button class="btn-primary" onclick="saveCustFollowup('+c.id+')" style="margin-top:8px">+ 添加跟进</button></div>'
    ,null,null,'700px');
}
function saveCustFollowup(custId){
  var c=null;
  for(var i=0;i<DB_CUSTOMERS.length;i++){if(DB_CUSTOMERS[i].id===custId){c=DB_CUSTOMERS[i];break}}
  if(!c){toast('客户不存在','error');return}
  var type=$('fup-type').value;
  var content=$('fup-content').value.trim();
  if(!content){toast('请输入跟进内容','error');return}
  if(!c.followups)c.followups=[];
  c.followups.push({
    type:type,
    content:content,
    user:curUser.name,
    ts:todayStr()+' '+new Date().toTimeString().substr(0,5)
  });
  syncAll();
  toast('跟进已保存');
  renderCustFollowups(c);
}
function fillMonthSel(id){var sel=$(id);if(!sel)return;var ms=new Set();for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].od)ms.add(DB_ORDERS[i].od.substring(0,7))}var cur=sel.value,arr=[];ms.forEach(function(m){arr.push(m)});sel.innerHTML='<option value="">\u5168\u90e8\u6708\u4efd</option>'+arr.sort().reverse().map(function(m){return '<option value="'+m+'"'+(m===cur?' selected':'')+'>'+m+'</option>'}).join('')}
function fillSalesSel(id){var sel=$(id);if(!sel)return;if(curRole==='sales'){sel.innerHTML='<option value="">\u5168\u90e8\u4e1a\u52a1\u5458</option>';return}var ss=new Set();for(var i=0;i<DB_ORDERS.length;i++){if(DB_ORDERS[i].sl)ss.add(DB_ORDERS[i].sl)}var cur=sel.value,arr=[];ss.forEach(function(s){arr.push(s)});sel.innerHTML='<option value="">\u5168\u90e8\u4e1a\u52a1\u5458</option>'+arr.map(function(s){return '<option value="'+s+'"'+(s===cur?' selected':'')+'>'+s+'</option>'}).join('')}

function renderPerformance(){
  fillMonthSel('perf-filter-month');fillSalesSel('perf-filter-sales');
  var fm=$('perf-filter-month').value,fs=$('perf-filter-sales').value;
  var orders=[].concat(DB_ORDERS);
  if(curRole==='sales')orders=orders.filter(function(o){return o.sl===curUser.name});
  // 移除 ap==='approved' 筛选，改为按子订单已确认收款统计
  // orders=orders.filter(function(o){return o.ap==='approved'});
  if(fm){var ym=fm.split('-');orders=orders.filter(function(o){if(!o.od)return false;var d=o.od.split('-');return +d[0]===+ym[0]&&+d[1]===+ym[1]})}
  if(fs)orders=orders.filter(function(o){return o.sl===fs});
  var sm={},ranks=['\ud83e\udd47','\ud83e\udd48','\ud83e\udd49','4\ufe0f\u20e3','5\ufe0f\u20e3'];
  for(var i=0;i<orders.length;i++){var o=orders[i];sumConfirmedOrder(o);if(!sm[o.sl])sm[o.sl]={n:o.sl,oc:0,sCnt:0,rCnt:0,income:0,cost:0,exp:0,nC:0,oC:0};var s=sm[o.sl];s.rCnt+=(o._addrRenewCnt||0);s.sCnt+=(o._addrSaleCnt||0);s.oc+=((o._addrSaleCnt||0)+(o._addrRenewCnt||0));s.income+=(o.pm_total||0);s.cost+=(o.cost_total||0);s.exp+=(o.exp_total||0);if(o.ct==='\u65b0\u5ba2\u6237')s.nC++;else s.oC++}
  var cs=[];for(var k in sm)cs.push(sm[k]);cs.sort(function(a,b){return b.income-a.income});
  window._perfData=cs;
  cs=applyTableFilter(cs,_perfFilters,_perfSort,_perfCtx);
  updateHeaderIndicators($('perf-tbody').parentNode,_perfFilters,_perfSort);
  var cardsHtml='';for(var i=0;i<cs.length;i++){var c=cs[i];var profit=(c.income||0)-(c.cost||0)-(c.exp||0);cardsHtml+='<div class="perf-card"><div class="perf-rank">'+(ranks[i]||'\ud83d\udccb')+'</div><div class="perf-name">'+esc(c.n)+'</div><div class="perf-amount">'+fmtM(profit)+'</div><div class="perf-orders">'+c.oc+' \u5355 \u00b7 \u65b0\u5ba2'+c.nC+' \u8001\u5ba2'+c.oC+'</div></div>'}
  $('performance-cards').innerHTML=cardsHtml||'<div class="empty-state">\u6682\u65e0\u4e1a\u7ee9</div>';
  // 计算总利润
  var totalProfit=0;
  for(var pi=0;pi<cs.length;pi++){var pc=cs[pi];totalProfit+=(pc.income||0)-(pc.cost||0)-(pc.exp||0);}
  var tpEl=document.getElementById('perf-total-profit');
  if(tpEl)tpEl.textContent=fmtM(totalProfit);
  var tbHtml='';for(var i=0;i<cs.length;i++){var c=cs[i],avg=c.oc>0?Math.round((c.income-c.cost-c.exp)/c.oc):0;tbHtml+='<tr><td style="text-align:center;color:#888;font-size:12px">'+(i+1)+'</td><td><strong>'+esc(c.n)+'</strong></td><td>'+c.rCnt+'</td><td>'+c.sCnt+'</td><td>'+c.oc+'</td><td class="num-income">'+fmtM(c.income)+'</td><td class="num-cost">'+fmtM(c.cost)+'</td><td class="num-exp">'+fmtM(c.exp)+'</td><td class="num-profit">'+fmtM(c.income-c.cost-c.exp)+'</td><td>'+fmtM(avg)+'</td><td>'+c.nC+'</td><td>'+c.oC+'</td></tr>'}
  $('perf-tbody').innerHTML=tbHtml||'<tr><td colspan="12" class="empty-state"><p>\u6682\u65e0</p></td></tr>';
}

function renderIncomeTable(){
  fillMonthSel('income-filter-month');var fm=$('income-filter-month').value,ft=$('income-filter-type').value;
  // 按子订单收集数据（每个子订单一行）
  var incomeOrders=DB_ORDERS;
  if(curRole==='sales')incomeOrders=incomeOrders.filter(function(o){return o.sl===curUser.name});
  var subRows=[];
  for(var i=0;i<incomeOrders.length;i++){
    var o=incomeOrders[i];
    if(fm&&(!o.od||o.od.substring(0,7)!==fm))continue;
    if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var bt=it.bt||o.bt;
      if(ft&&bt!==ft)continue;
      // 已审批通过的收款总额
      var pm=0,pfTime='',payAccount='',pfUser='';
      var payRecs=it.pr_records||[];
      if(payRecs.length>0){
        for(var pi=0;pi<payRecs.length;pi++){
          var rec=payRecs[pi];
          if(!rec.pf||rec.prej)continue;
          pm+=rec.pm||0;
          if(!pfTime||rec.pf>pfTime)pfTime=rec.pf;
          if(!payAccount)payAccount=rec.pa||it.pa||'';
          if(!pfUser)pfUser=rec.pf_user||'';
        }
      }else if(it.pm>0&&it.pd){
        pm=it.pm||0;pfTime=it.pd;payAccount=it.pa||'';
      }
      if(pm<=0)continue;
      // 已审批通过的支出
      var exp=0,expTime='';
      var xrRecs=it.xr||[];
      for(var xi=0;xi<xrRecs.length;xi++){if(xrRecs[xi].xf&&!xrRecs[xi].xrej){exp+=(parseFloat(xrRecs[xi].xm_actual||xrRecs[xi].xm)||0);if(!expTime)expTime=xrRecs[xi].xf;}}
      subRows.push({bn:o.bn||'',subBn:it.subBn||('\u5b50'+j),bt:bt,addr:it.addr||'',sl:o.sl,co:it.co||o.co,pfTime:pfTime,payAccount:payAccount,pm:pm,pfUser:pfUser,cost:it.cost||0,exp:exp,expTime:expTime,oid:o.id,subIdx:j});
    }
  }
  subRows.sort(function(a,b){return a.pfTime<b.pfTime?1:-1});
  window._incData=subRows;
  subRows=applyTableFilter(subRows,_incFilters,_incSort,_incCtx);
  updateHeaderIndicators($('income-tbody').parentNode,_incFilters,_incSort);
  // 统计卡片
  var ti=subRows.reduce(function(s,r){return s+r.pm},0),tc=subRows.reduce(function(s,r){return s+r.cost},0),te=subRows.reduce(function(s,r){return s+r.exp},0),tp=ti-tc-te,mg=ti>0?(tp/ti*100).toFixed(1):'0.0';
  $('income-total').textContent=fmtM(ti);$('income-cost').textContent=fmtM(tc);$('income-expense').textContent=fmtM(te);$('income-profit').textContent=fmtM(tp);$('income-margin').textContent=mg+'%';
  // 分页 + 业务编号合并
  var tpp=Math.ceil(subRows.length/PS)||1;if(ip>tpp)ip=tpp;var pd=subRows.slice((ip-1)*PS,ip*PS);
  var bnPageCount={};
  for(var i=0;i<pd.length;i++){var bn=pd[i].bn||'';if(!bnPageCount[bn])bnPageCount[bn]=0;bnPageCount[bn]++;}
  var btTag={'\u5730\u5740\u9500\u552e':'tag-blue','\u5730\u5740\u7eed\u8d39':'tag-green'};
  var html='',bnRendered={};
  for(var i=0;i<pd.length;i++){
    var r=pd[i];
    var profit=r.pm-r.cost-r.exp;
    var bg=i%2===0?'background:#fff':'background:#ecfdf5';
    var bn=r.bn||'';
    html+='<tr style="border-bottom:1px solid #d1fae5;'+bg+'">';
    html+='<td style="text-align:center;color:#888;font-size:12px;padding:6px 8px">'+((ip-1)*PS+i+1)+'</td>';
    if(!bnRendered[bn])bnRendered[bn]=0;
    if(bnRendered[bn]===0){
      html+='<td style="padding:6px 8px;font-weight:600" rowspan="'+bnPageCount[bn]+'"><a href="#" onclick="showOrderDetailByBn(\''+esc(bn)+'\');return false" style="color:var(--blue);text-decoration:underline">'+esc(bn)+'</a></td>';
    }
    bnRendered[bn]++;
    html+='<td style="padding:6px 8px">'+esc(r.subBn)+'</td>'
      +'<td style="padding:6px 8px"><span class="'+(btTag[r.bt]||'')+'" style="font-size:11px">'+esc(r.bt)+'</span></td>'
      +'<td style="padding:6px 8px">'+esc(r.sl)+'</td>'
      +'<td style="padding:6px 8px" title="'+esc(r.co)+'">'+esc(r.co)+'</td>'
      +'<td style="padding:6px 8px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(r.addr)+'">'+esc(r.addr)+'</td>'
      +'<td style="padding:6px 8px"><a href="#" onclick="showIncomeDetailBySub(\''+esc(r.subBn)+'\','+r.oid+');return false" style="color:var(--blue);text-decoration:underline">'+esc(r.pfTime)+'</a></td>'
      +'<td style="padding:6px 8px">'+esc(r.payAccount)+'</td>'
      +'<td style="padding:6px 8px;font-weight:600;color:#059669">'+fmtM(r.pm)+'</td>'
      +'<td style="padding:6px 8px;color:#6b7280">'+(r.expTime?'<a href="#" onclick="showIncomeExpTime(\''+esc(r.subBn)+'\','+r.oid+');return false" style="color:var(--blue);text-decoration:underline">'+esc(r.expTime)+'</a>':'<span style="color:#ccc">-</span>')+'</td>'
      +'<td style="padding:6px 8px;color:#6b7280">'+fmtM(r.cost)+'</td>'
      +'<td style="padding:6px 8px;color:#dc2626">'+fmtM(r.exp)+'</td>'
      +'<td style="padding:6px 8px;font-weight:600;color:'+(profit>=0?'#059669':'#dc2626')+'">'+fmtM(profit)+'</td>'
      +'<td style="padding:6px 8px;color:#6b7280">'+esc(r.pfUser||'-')+'</td>'
      +'<td class="td-actions">'
      +'<button type="button" class="btn-view" style="padding:2px 6px;font-size:11px" onclick="showIncomeDetailBySub(\''+esc(r.subBn)+'\','+r.oid+')">详情</button>'
      +(curRole==='admin'||curRole==='finance'||curRole==='gm'
        ?'<button type="button" class="btn-danger" style="padding:2px 6px;font-size:11px" onclick="deleteIncomeSub(\''+esc(r.subBn)+'\','+r.oid+','+r.subIdx+')">删除</button>'
        :'')
      +'</td></tr>';
  }
  $('income-tbody').innerHTML=html||'<tr><td colspan="16" class="empty-state"><p class="empty-text">暂无数据</p></td></tr>';
  buildPg($('income-pagination'),tpp,ip,function(p){ip=p;renderIncomeTable()});
}

// ========== 工资计算 / 财务支出 导出 ==========
function exportSalary(){
  if(curRole!=='admin'&&curRole!=='finance'){toast('无权操作','error');return;}
  // 复用渲染时的数据逻辑
  var fm=$('salary-filter-month').value,fs=$('salary-filter-sales').value;
  var isMgmt=(curRole==='admin'||curRole==='finance'||curRole==='gm');
  var orderMap={};
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(fm&&(!o.od||o.od.substring(0,7)!==fm))continue;
    if(fs&&o.sl!==fs)continue;
    if(!isMgmt&&o.sl!==curUser.name)continue;
    if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var pm=0;
      var payRecs=it.pr_records||[];
      if(payRecs.length>0){
        for(var pi=0;pi<payRecs.length;pi++){if(payRecs[pi].pf&&!payRecs[pi].prej) pm+=(payRecs[pi].pm||0);}
      }else if(it.pm>0&&it.pd){pm=it.pm||0;}
      if(pm<=0)continue;
      var profit=pm-(it.cost||0);
      var xrRecs=it.xr||[];
      for(var xi=0;xi<xrRecs.length;xi++){if(xrRecs[xi].xf) profit-=(parseFloat(xrRecs[xi].xm)||0);}
      if(!orderMap[o.id])orderMap[o.id]={ordBn:o.bn,sales:o.sl,totalPm:0,totalProfit:0,comm:0,items:[],_saleRate:null,_renewRate:null};
      orderMap[o.id].items.push({bt:it.bt,pm:pm,profit:profit,subBn:it.subBn});
      orderMap[o.id].totalPm+=pm;
      orderMap[o.id].totalProfit+=profit;
      if(orderMap[o.id]._saleRate===null)orderMap[o.id]._saleRate=it._saleRate||null;
      if(orderMap[o.id]._renewRate===null)orderMap[o.id]._renewRate=it._renewRate||null;
    }
  }
  var orderArr=[];for(var k in orderMap)orderArr.push(orderMap[k]);
  orderArr.sort(function(a,b){return a.ordBn<b.ordBn?-1:1});
  // 计算佣金
  for(var i=0;i<orderArr.length;i++){
    var om=orderArr[i];
    var u=DB_USERS.find(function(x){return x.name===om.sales});
    var saleRate=om._saleRate||(u?u.commissionSale:18);
    var renewRate=om._renewRate||(u?u.commissionRenew:15);
    om.saleRate=saleRate;om.renewRate=renewRate;
    var totalComm=0;
    for(var j=0;j<om.items.length;j++){
      var it=om.items[j];
      var rate=it.bt==='renew'?renewRate:saleRate;
      totalComm+=Math.round(it.profit*rate/100);
    }
    om.comm=totalComm;
  }
  // 生成子订单明细行
  var headers=['母订单编号','业务员','子订单编号','类型','收款金额','成本','支出','利润','提成比例(%)','佣金'];
  var rows=[];
  for(var i=0;i<orderArr.length;i++){
    var om=orderArr[i];
    for(var j=0;j<om.items.length;j++){
      var it=om.items[j];
      var rate=it.bt==='renew'?om.renewRate:om.saleRate;
      // 计算子订单的支出
      var subExp=0;
      var xr=it.item&&it.item.xr||[];
      for(var xi=0;xi<xr.length;xi++){if(xr[xi].xf) subExp+=(parseFloat(xr[xi].xm)||0);}
      var subCost=it.item&&it.item.cost||200;
      rows.push([om.ordBn,om.sales,it.subBn||'',it.bt,it.pm,subCost,subExp,it.profit,rate,Math.round(it.profit*rate/100)]);
    }
  }
  downloadExcel(headers,rows,'工资明细');
  // 再导出汇总表
  var sm={};
  for(var i=0;i<orderArr.length;i++){
    var om=orderArr[i];
    if(!sm[om.sales])sm[om.sales]={totalPm:0,totalProfit:0,totalComm:0,sCnt:0,rCnt:0};
    sm[om.sales].totalPm+=om.totalPm;
    sm[om.sales].totalProfit+=om.totalProfit;
    sm[om.sales].totalComm+=om.comm;
    for(var j=0;j<om.items.length;j++){
      var it=om.items[j];
      if(it.bt==='renew')sm[om.sales].rCnt++;
      else sm[om.sales].sCnt++;
    }
  }
  var sumHeaders=['业务员','销售订单数','续费订单数','总收款','总利润','总佣金'];
  var sumRows=[];
  for(var s in sm){
    sumRows.push([s,sm[s].sCnt,sm[s].rCnt,sm[s].totalPm,sm[s].totalProfit,sm[s].totalComm]);
  }
  downloadExcel(sumHeaders,sumRows,'工资汇总');
}
function exportExpenses(){
  if(curRole!=='admin'&&curRole!=='finance'){toast('无权操作','error');return;}
  var exps=getExps();
  var headers=['支出时间','业务编号','业务员','单位名称','地址','子订单','支出金额','支出账号','成本','备注'];
  var rows=[];
  for(var i=0;i<exps.length;i++){
    var e=exps[i];
    rows.push([e.pfTime||'',e.bn||'',e.sl||'',e.co||'',e.addr||'',(e.subBns||[]).join(','),
      e.xm||0,e.expAccount||'',e.cost||0,e.rk||'']);
  }
  downloadExcel(headers,rows,'财务支出');
}
function exportIncome(){
  if(curRole!=='admin'&&curRole!=='finance'){toast('无权操作','error');return;}
  var headers=['业务编号','子订单','类型','地址','业务员','单位名称','收款时间','收款账号','收款金额','成本','支出','收益'];
  var rows=[];
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var itemPm=0,itemPayRecords=it.pr_records||[];
      for(var pi=0;pi<itemPayRecords.length;pi++){if(!itemPayRecords[pi].prej)itemPm+=(parseFloat(itemPayRecords[pi].pm)||0)}
      if(itemPm>0){
        var pdStr=itemPayRecords.length>0?(itemPayRecords[0].pd||''):'';
        var paStr=itemPayRecords.length>0?(itemPayRecords[0].pa||''):'';
        var itemXm=0,itemExpRecords=it.xr||[];
        for(var ei=0;ei<itemExpRecords.length;ei++){if(!itemExpRecords[ei].xrej)itemXm+=(parseFloat(itemExpRecords[ei].xm)||0)}
        var profit=itemPm-(it.cost||0)-itemXm;
        var btLabel=it.bt==='renew'?'续费':'销售';
        rows.push([o.bn||'',it.subBn||'',btLabel,it.addr||'',o.sl||'',it.co||o.co||'',pdStr,paStr,itemPm,it.cost||0,itemXm,profit]);
      }
    }
  }
  downloadExcel(headers,rows,'公司收入');
}

// ========== Excel 导出 / 模板下载（补全）==========
function downloadExcel(headers,rows,filename,extraSheets){
  if(typeof XLSX==='undefined'){toast('Excel库加载中，请稍后重试','error');return;}
  var wb=XLSX.utils.book_new();
  // 主数据表
  var ws=XLSX.utils.aoa_to_sheet([headers].concat(rows));
  var colWidths=headers.map(function(h,i){
    var maxLen=h.length;
    for(var j=0;j<rows.length;j++){
      var cell=(rows[j][i]||'').toString();
      if(cell.length>maxLen)maxLen=cell.length;
    }
    return {wch:Math.min(maxLen+4,40)};
  });
  ws['!cols']=colWidths;
  XLSX.utils.book_append_sheet(wb,ws,'数据明细');
  // 如果有汇总信息，加为第二个Sheet
  if(extraSheets){
    for(var si=0;si<extraSheets.length;si++){
      var es=extraSheets[si];
      var esWs=XLSX.utils.aoa_to_sheet(es.data);
      XLSX.utils.book_append_sheet(wb,esWs,es.name||'汇总');
    }
  }
  XLSX.writeFile(wb,filename+'.xlsx');
}

// ========== 操作日志 ==========
async function renderAuditLog(){
  var tbody=document.getElementById('audit-tbody');
  var empty=document.getElementById('audit-empty');
  if(!tbody)return;
  try{
    var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
    var r=await fetch('/api/audit-logs',{headers:_token?{'Authorization':'Bearer '+_token}:{}});
    if(!r.ok){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#999">加载失败</td></tr>';return}
    var logs=await r.json();
    window._auditData=logs;
    logs=applyTableFilter(logs,_auditFilters,_auditSort,_auditCtx);
    updateHeaderIndicators(document.getElementById('audit-table'),_auditFilters,_auditSort);
    if(!logs||logs.length===0){
      if(empty)empty.style.display='block';
      tbody.innerHTML='';
      return;
    }
    if(empty)empty.style.display='none';
    var html='';
    for(var i=0;i<logs.length;i++){
      var l=logs[i];
      // 操作类型图标
      var icon='📝';
      if(l.action==='delete')icon='🗑️';
      else if(l.action==='save')icon='💾';
      var cls=l.action==='delete'?' style="color:#ef4444"':'';
      html+='<tr'+cls+'><td style="white-space:nowrap">'+(l.ts||'').slice(0,19)+'</td>'
        +'<td>'+esc(l.username||'')+'</td>'
        +'<td>'+icon+' '+esc(l.action||'')+'</td>'
        +'<td>'+esc(l.table_name||'')+'</td>'
        +'<td>'+esc((l.summary||'').slice(0,80))+'</td></tr>';
    }
    tbody.innerHTML=html;
  }catch(e){
    tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:#999">加载失败</td></tr>';
  }
}
// 开票状态卡点击筛选
function filterInvByStatus(status){
  invSelectedStatus=status;
  renderInvoicePage();
}

// ========== 开票申请 ==========
function renderInvoicePage(){
  // 所有角色均可申请开票
  var btn=$('inv-apply-btn');
  if(btn)btn.style.display='';

  // 同步dropdown与选中状态
  var sel=$('invoice-filter-status');
  if(sel)sel.value=invSelectedStatus||'';

  // 更新stat-card选中态
  var cards=document.querySelectorAll('.invoice-stats .stat-card');
  for(var ci=0;ci<cards.length;ci++){
    cards[ci].classList.toggle('card-active',cards[ci].getAttribute('data-inv-status')===invSelectedStatus);
  }

  var kw=invSelectedStatus||'';
  var list=DB_INVOICES.filter(function(r){
    // 销售员只能看到自己名下（作为申请人与业务员）的开票记录
    if(curRole==='sales'&&r.appliedBy!==curUser.name&&r.salesperson!==curUser.name)return false;
    if(kw&&r.status!==kw)return false;
    return true;
  });
  list=applyTableFilter(list,_invFilters,_invSort,_invCtx);
  updateHeaderIndicators($('invoice-tbody').parentNode,_invFilters,_invSort);
  // 统计
  var pc=DB_INVOICES.filter(function(x){return x.status==='pending'}).length;
  var ac=DB_INVOICES.filter(function(x){return x.status==='approved'}).length;
  var rc=DB_INVOICES.filter(function(x){return x.status==='rejected'}).length;
  var p1=$('inv-pending-count');if(p1)p1.textContent=pc;
  var p2=$('inv-approved-count');if(p2)p2.textContent=ac;
  var p3=$('inv-rejected-count');if(p3)p3.textContent=rc;
  // 渲染表格
  var statusMap={pending:'待开票',approved:'✅ 已开票',rejected:'❌ 已驳回'};
  var statusCls={pending:'tag-orange',approved:'tag-green',rejected:'tag-red'};
  var html='';
  for(var i=0;i<list.length;i++){
    var r=list[i];
    var bg=i%2===0?'background:#fff':'background:#f0f4ff';
    var st=statusMap[r.status]||r.status;
    var stCls=statusCls[r.status]||'';
    // 操作按钮：所有可见记录统一显示「修改」+「删除」
    var actions='';
    var canManage=(curRole==='admin'||r.appliedBy===curUser.name);
    if(canManage){
      actions+=' <button class="btn-approve" onclick="editInvoice('+r.id+')" style="padding:2px 8px;font-size:11px;background:#3b82f6">修改</button>';
      actions+=' <button class="btn-danger" onclick="deleteInvoiceRecord('+r.id+')" style="padding:2px 8px;font-size:11px">删除</button>';
    }
    html+='<tr style="border-bottom:1px solid #c7d2fe;'+bg+'">'
      +'<td style="text-align:center;color:#888;font-size:12px">'+(i+1)+'</td>'
      +'<td style="padding:6px 8px"><a href="#" onclick="showOrderDetailByBn(\''+esc(r.bn||'').replace(/'/g,"\\'")+'\');return false" style="color:#3b82f6;text-decoration:underline">'+esc(r.bn||'-')+'</a></td>'
      +'<td style="padding:6px 8px;font-size:12px">'+esc(r.salesperson||'-')+'</td>'
      +'<td style="padding:6px 8px;font-size:12px;color:#6b7280">'+esc(r.nick||'-')+'</td>'
      +'<td style="padding:6px 8px">'+esc(r.title||'-')+'</td>'
      +'<td style="padding:6px 8px;font-size:12px">'+esc(r.category||'-')+'</td>'
      +'<td style="padding:6px 8px;text-align:center"><span class="'+(r.priority==='加急'?'tag-red':'tag-gray')+'" style="font-size:11px">'+esc(r.priority||'普通')+'</span></td>'
      +'<td style="padding:6px 8px;text-align:right;font-weight:600">'+fmtM(r.amount||0)+'</td>'
      +'<td style="padding:6px 8px;font-size:12px;color:#6b7280">'+esc(r.ourUnit||'-')+'</td>'
      +'<td style="padding:6px 8px;font-size:12px">'+esc(r.invType||'-')+'</td>'
      +'<td style="padding:6px 8px"><span class="'+stCls+'" style="font-size:11px">'+st+'</span></td>'
      +'<td style="padding:6px 8px;font-size:12px;color:#6b7280">'+esc(r.appliedAt||'')+'</td>'
      +'<td style="padding:6px 8px;font-size:12px;color:#6b7280">'+esc(r.appliedBy||'-')+'</td>'
      +'<td style="padding:6px 8px;font-size:12px;color:#6b7280">'+esc(r.approvedBy||'-')+'</td>'
      +'<td class="td-actions">'+actions+'</td>'
      +'</tr>';
  }
  $('invoice-tbody').innerHTML=html||'<tr><td colspan="16" class="empty-state"><p>暂无开票记录</p></td></tr>';
}
// 申请开票
function openApplyInvoiceModal(){
  // 销售只能为自己名下的客户申请开票
  var salesNote='';
  if(curRole==='sales'){
    salesNote='<div style="background:#fef3c7;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:12px;color:#92400e">⚠️ 您只能为自己名下的订单申请开票</div>';
  }
  // 构建业务员下拉
  var salesOpts='';
  for(var i=0;i<DB_USERS.length;i++){
    var u=DB_USERS[i];
    var selected=(curRole==='sales'&&u.name===curUser.name)?' selected':'';
    salesOpts+='<option value="'+esc(u.name)+'"'+selected+'>'+esc(u.name)+'</option>';
  }
  // 我方开票单位：从所有用户的收款账号收集不重复值
  var ourUnits=[];
  var unitSeen={};
  for(var i=0;i<DB_USERS.length;i++){
    var accts=(DB_USERS[i].payAccount||'').split(',').map(function(a){return a.trim()}).filter(function(a){return a});
    for(var j=0;j<accts.length;j++){
      if(accts[j]&&!unitSeen[accts[j]]){unitSeen[accts[j]]=true;ourUnits.push(accts[j]);}
    }
  }
  var unitOpts='<option value="随意">随意</option>';
  for(var i=0;i<ourUnits.length;i++){
    unitOpts+='<option value="'+esc(ourUnits[i])+'">';
  }
  // 开票类目预设
  var catOpts='<option value="服务费"><option value="房租费"><option value="咨询费"><option value="技术服务费"><option value="管理费"><option value="信息服务费">';
  // 所有客户昵称（初始兜底，切换业务员时会动态更新）
  var allNickOpts='';
  var nickSeen={};
  for(var i=0;i<DB_CUSTOMERS.length;i++){
    var nn=(DB_CUSTOMERS[i].nn||'').trim();
    if(nn&&!nickSeen[nn]){nickSeen[nn]=true;allNickOpts+='<option value="'+esc(nn)+'">';}
  }
  for(var i=0;i<DB_ORDERS.length;i++){
    var nn=(DB_ORDERS[i].nick||'').trim();
    if(nn&&!nickSeen[nn]){nickSeen[nn]=true;allNickOpts+='<option value="'+esc(nn)+'">';}
  }
  var salesDisabled=(curRole==='sales')?' disabled':'';
  var body=salesNote+'<form id="inv-form"><div class="form-grid">'
    +'<div class="form-group"><label>业务员 <span style="color:red">*</span></label><select name="salesperson" id="inv-salesperson" onchange="onInvSalesChange()"'+salesDisabled+'>'+salesOpts+'</select></div>'
    +'<div class="form-group"><label>业务编号 <span style="color:red">*</span></label><input name="bn" id="inv-bn" list="inv-bn-list" placeholder="选择或输入业务编号" autocomplete="off" oninput="onInvBnInput()" required/><datalist id="inv-bn-list"></datalist></div>'
    +'<div class="form-group"><label>客户昵称</label><input name="nick" id="inv-nick" list="inv-nick-list" placeholder="选择或输入客户昵称" autocomplete="off"/><datalist id="inv-nick-list">'+allNickOpts+'</datalist></div>'
    +'<div class="form-group"><label>优先级</label><select name="priority"><option value="普通">普通</option><option value="加急">加急</option></select></div>'
    +'<div class="form-group"><label>受票方 <span style="color:red">*</span></label><input name="title" id="inv-title" placeholder="单位全称" required/></div>'
    +'<div class="form-group"><label>税号</label><input name="taxId" placeholder="统一社会信用代码"/></div>'
    +'<div class="form-group"><label>开票类目</label><input name="category" list="inv-cat-list" placeholder="选择或输入" autocomplete="off"/><datalist id="inv-cat-list">'+catOpts+'</datalist></div>'
    +'<div class="form-group"><label>发票类型</label><select name="invType"><option value="增值税普通发票">增值税普通发票</option><option value="增值税专用发票">增值税专用发票</option></select></div>'
    +'<div class="form-group"><label>开票金额 <span style="color:red">*</span></label><input type="number" name="amount" placeholder="0.00" required/></div>'
    +'<div class="form-group"><label>我方开票单位</label><input name="ourUnit" list="inv-unit-list" placeholder="选择或输入" autocomplete="off"/><datalist id="inv-unit-list">'+unitOpts+'</datalist></div>'
    +'<div class="form-group full"><label>备注</label><textarea name="rk" rows="2" placeholder="选填开票备注"></textarea></div>'
    +'</div></form>';
  showModal('申请开票',body,function(){
    var f=getFormData('inv-form');
    if(!f.salesperson||!f.bn||!f.title||!f.amount){toast('请填写必填项（业务员、业务编号、受票方、开票金额）','error');return;}
    // 销售验证：只能为自己名下的订单开票
    if(curRole==='sales'){
      var foundOrder=null;
      for(var oi=0;oi<DB_ORDERS.length;oi++){
        if(DB_ORDERS[oi].bn===f.bn){foundOrder=DB_ORDERS[oi];break;}
      }
      if(!foundOrder){toast('业务编号不存在，请检查','error');return;}
      if(foundOrder.sl!==curUser.name&&foundOrder.ac!==curUser.account){toast('您只能为自己名下的订单申请开票','error');return;}
    }
    f.id=Date.now();
    f.status='pending';
    f.appliedBy=curUser.name;
    f.appliedAt=todayStr();
    f.appliedByUser=curUser.username;
    DB_INVOICES.push(f);
    syncAll();
    renderInvoicePage();
    toast('开票申请已提交');
    closeAllModals();
  });
  // 初始化业务编号和客户昵称下拉
  setTimeout(onInvSalesChange,50);
}
// 业务员切换时更新业务编号和客户昵称下拉
function onInvSalesChange(){
  var sel=document.getElementById('inv-salesperson');
  var bnList=document.getElementById('inv-bn-list');
  var nickList=document.getElementById('inv-nick-list');
  var nickInput=document.getElementById('inv-nick');
  if(!sel||!bnList||!nickList)return;
  var salesName=sel.value;
  // 清空业务编号输入
  var bnInput=document.getElementById('inv-bn');
  if(bnInput)bnInput.value='';
  // 筛选该业务员名下未开票的订单
  var orders=[];
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(o.sl===salesName&&o.invStatus!=='approved'){
      orders.push(o);
    }
  }
  // 更新业务编号datalist
  bnList.innerHTML='';
  var bnSet={};
  for(var i=0;i<orders.length;i++){
    if(orders[i].bn&&!bnSet[orders[i].bn]){
      bnSet[orders[i].bn]=true;
      var opt=document.createElement('option');
      opt.value=orders[i].bn;
      bnList.appendChild(opt);
    }
  }
  // 更新客户昵称datalist
  nickList.innerHTML='';
  var nickSet={};
  for(var i=0;i<orders.length;i++){
    if(orders[i].nick&&!nickSet[orders[i].nick]){
      nickSet[orders[i].nick]=true;
      var opt=document.createElement('option');
      opt.value=orders[i].nick;
      nickList.appendChild(opt);
    }
  }
  for(var i=0;i<DB_CUSTOMERS.length;i++){
    var c=DB_CUSTOMERS[i];
    if(c.sl===salesName&&c.nn&&!nickSet[c.nn]){
      nickSet[c.nn]=true;
      var opt=document.createElement('option');
      opt.value=c.nn;
      nickList.appendChild(opt);
    }
  }
}
// 业务编号输入时自动匹配受票方
function onInvBnInput(){
  var bn=document.getElementById('inv-bn');
  var title=document.getElementById('inv-title');
  var nick=document.getElementById('inv-nick');
  if(!bn||!title)return;
  var val=bn.value.trim();
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].bn===val){
      // 自动填充受票方（单位名称）
      if(DB_ORDERS[i].co&&!title.value)title.value=DB_ORDERS[i].co;
      // 自动填充客户昵称
      if(DB_ORDERS[i].nick&&nick&&!nick.value)nick.value=DB_ORDERS[i].nick;
      break;
    }
  }
}
// 确认开票
function approveInvoice(id){
  var inv=null;
  for(var i=0;i<DB_INVOICES.length;i++){if(DB_INVOICES[i].id===id){inv=DB_INVOICES[i];break;}}
  var hasFile=inv&&inv.invFile;
  var uploadTip=hasFile?'<div style="background:#d1fae5;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:12px;color:#065f46">✅ 开票文件已上传</div>':'<div style="background:#fef3c7;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:12px;color:#92400e">⚠️ 请上传开票文件（PDF/JPG/PNG）</div>';
  var body='<div id="inv-approve-form">'+uploadTip+'<div class="form-group"><label>开票文件</label><input type="file" id="inv-approve-file" accept=".pdf,.jpg,.png" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:13px"/></div><div class="form-group"><label>确认备注</label><textarea name="invApproveRk" rows="2" placeholder="选填" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;resize:vertical;font-size:13px"></textarea></div></div>';
  showModal('确认开票',body,function(){
    var fileInput=document.getElementById('inv-approve-file');
    var file=fileInput&&fileInput.files&&fileInput.files[0];
    var invApproveRk=(document.querySelector('#inv-approve-form textarea')||{}).value||'';
    var doApprove=function(url){
      for(var i=0;i<DB_INVOICES.length;i++){
        if(DB_INVOICES[i].id===id){
          DB_INVOICES[i].status='approved';
          DB_INVOICES[i].approvedBy=curUser.name;
          DB_INVOICES[i].approvedAt=todayStr()+' '+new Date().toTimeString().substr(0,5);
          DB_INVOICES[i].invApproveRk=invApproveRk;
          if(url)DB_INVOICES[i].invFile=url;
          inv=DB_INVOICES[i];
          break;
        }
      }
      if(inv&&inv.bn){
        for(var oi=0;oi<DB_ORDERS.length;oi++){
          if(DB_ORDERS[oi].bn===inv.bn){
            DB_ORDERS[oi].invStatus='approved';
            DB_ORDERS[oi].invApprovedAt=todayStr();
            break;
          }
        }
      }
      syncAll();
      renderInvoicePage();
      renderApprovalPage();
      addNotification('开票已确认','success');
      toast('已确认开票');
      closeAllModals();
    };
    if(file){
      uploadImage(file).then(function(url){
        if(!url){toast('文件上传失败','error');return;}
        doApprove(url);
      }).catch(function(e){toast('上传失败: '+e,'error');});
    }else{
      doApprove(null);
    }
  },{title:'确认开票',okText:'确认开票'});
}
// 驳回开票
function rejectInvoice(id){
  confirmDialog('确定驳回该开票申请？',function(){
    var inv=null;
    for(var i=0;i<DB_INVOICES.length;i++){
      if(DB_INVOICES[i].id===id){
        DB_INVOICES[i].status='rejected';
        DB_INVOICES[i].approvedBy=curUser.name;
        DB_INVOICES[i].approvedAt=todayStr()+' '+new Date().toTimeString().substr(0,5);
        inv=DB_INVOICES[i];
        break;
      }
    }
    // 关联到订单：标记开票已驳回
    if(inv&&inv.bn){
      for(var oi=0;oi<DB_ORDERS.length;oi++){
        if(DB_ORDERS[oi].bn===inv.bn){
          DB_ORDERS[oi].invStatus='rejected';
          break;
        }
      }
    }
    syncAll();
    renderInvoicePage();
    addNotification('开票申请被驳回','error');
    toast('已驳回开票申请');
  },{title:'驳回开票',okText:'确认驳回'});
}
// 撤回开票申请（申请人可撤回自己的待审批申请）
function withdrawInvoice(id){
  confirmDialog('确定撤回该开票申请？',function(){
    var inv=null;
    for(var i=0;i<DB_INVOICES.length;i++){if(DB_INVOICES[i].id===id){inv=DB_INVOICES[i];break;}}
    DB_INVOICES=DB_INVOICES.filter(function(x){return x.id!==id});
    // 清理关联订单的 invStatus（如果该订单只有这条开票记录）
    if(inv&&inv.bn){
      var hasOtherPending=DB_INVOICES.some(function(x){return x.bn===inv.bn&&x.id!==id});
      if(!hasOtherPending){
        for(var oi=0;oi<DB_ORDERS.length;oi++){
          if(DB_ORDERS[oi].bn===inv.bn){delete DB_ORDERS[oi].invStatus;break;}
        }
      }
    }
    syncAll();
    renderInvoicePage();
    renderApprovalPage();
    addNotification('开票申请已撤回','info');
    toast('已撤回');
  },{title:'撤回申请',okText:'确认撤回'});
}
// 上传开票文件
function uploadInvFile(id){
  var input=document.getElementById('inv-file-input-'+id);
  if(!input||!input.files||!input.files[0]){toast('请选择文件','error');return;}
  uploadImage(input.files[0]).then(function(url){
    if(!url){toast('上传失败','error');return;}
    for(var i=0;i<DB_INVOICES.length;i++){
      if(DB_INVOICES[i].id===id){DB_INVOICES[i].invFile=url;break;}
    }
    syncAll();
    renderApprovalPage();
    toast('开票文件已上传');
  }).catch(function(e){toast('上传失败: '+e,'error');});
}
// 审批中心卡片的"上传发票文件"按钮
function uploadInvoiceFile(id){
  var body='<div class="form-group"><label>选择发票文件（PDF/JPG/PNG）</label><input type="file" id="inv-card-file-'+id+'" accept=".pdf,.jpg,.png" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:13px"/></div>';
  showModal('上传发票文件',body,function(){
    var input=document.getElementById('inv-card-file-'+id);
    if(!input||!input.files||!input.files[0]){toast('请选择文件','error');return;}
    uploadImage(input.files[0]).then(function(url){
      if(!url){toast('上传失败','error');return;}
      for(var i=0;i<DB_INVOICES.length;i++){
        if(DB_INVOICES[i].id===id){DB_INVOICES[i].invFile=url;break;}
      }
      syncAll();
      renderApprovalPage();
      toast('发票文件已上传');
      closeAllModals();
    }).catch(function(e){toast('上传失败: '+e,'error');});
  },{title:'上传发票文件',okText:'上传'});
}
// 重新申请开票（复制已驳回的记录为新申请）
function reapplyInvoice(id){
  var inv=null;
  for(var i=0;i<DB_INVOICES.length;i++){if(DB_INVOICES[i].id===id){inv=DB_INVOICES[i];break;}}
  if(!inv){toast('记录不存在','error');return;}
  var newInv=JSON.parse(JSON.stringify(inv));
  newInv.id=Date.now();
  newInv.status='pending';
  newInv.appliedBy=curUser.name;
  newInv.appliedAt=todayStr();
  newInv.approvedBy='';
  newInv.approvedAt='';
  newInv.invFile='';
  DB_INVOICES.push(newInv);
  syncAll();
  renderInvoicePage();
  renderApprovalPage();
  toast('已重新提交开票申请');
}
// 编辑开票申请（打开弹窗预填数据）
function editInvoice(id){
  var inv=null;
  for(var i=0;i<DB_INVOICES.length;i++){if(DB_INVOICES[i].id===id){inv=DB_INVOICES[i];break;}}
  if(!inv){toast('记录不存在','error');return;}
  var salesNote='';
  if(curRole==='sales'){
    salesNote='<div style="background:#fef3c7;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:12px;color:#92400e">⚠️ 您只能为自己名下的订单申请开票</div>';
  }
  var salesOpts='';
  for(var i=0;i<DB_USERS.length;i++){
    var u=DB_USERS[i];
    var selected=(curRole==='sales'&&u.name===curUser.name)?' selected':(u.name===inv.salesperson?' selected':'');
    salesOpts+='<option value="'+esc(u.name)+'"'+selected+'>'+esc(u.name)+'</option>';
  }
  var ourUnits=[];
  var unitSeen={};
  for(var i=0;i<DB_USERS.length;i++){
    var accts=(DB_USERS[i].payAccount||'').split(',').map(function(a){return a.trim()}).filter(function(a){return a});
    for(var j=0;j<accts.length;j++){
      if(accts[j]&&!unitSeen[accts[j]]){unitSeen[accts[j]]=true;ourUnits.push(accts[j]);}
    }
  }
  var unitOpts='<option value="随意">随意</option>';
  for(var i=0;i<ourUnits.length;i++){
    unitOpts+='<option value="'+esc(ourUnits[i])+'">';
  }
  var catOpts='<option value="服务费"><option value="房租费"><option value="咨询费"><option value="技术服务费"><option value="管理费"><option value="信息服务费">';
  var salesDisabled=(curRole==='sales')?' disabled':'';
  var body=salesNote+'<form id="inv-form"><div class="form-grid">'
    +'<div class="form-group"><label>业务员 <span style="color:red">*</span></label><select name="salesperson" id="inv-salesperson"'+salesDisabled+'>'+salesOpts+'</select></div>'
    +'<div class="form-group"><label>业务编号 <span style="color:red">*</span></label><input name="bn" id="inv-bn" list="inv-bn-list" placeholder="选择或输入业务编号" autocomplete="off" value="'+esc(inv.bn||'')+'" required/><datalist id="inv-bn-list"></datalist></div>'
    +'<div class="form-group"><label>客户昵称</label><input name="nick" id="inv-nick" list="inv-nick-list" placeholder="选择或输入客户昵称" autocomplete="off" value="'+esc(inv.nick||'')+'"/></div>'
    +'<div class="form-group"><label>优先级</label><select name="priority"><option value="普通"'+(inv.priority==='普通'?' selected':'')+'>普通</option><option value="加急"'+(inv.priority==='加急'?' selected':'')+'>加急</option></select></div>'
    +'<div class="form-group"><label>受票方 <span style="color:red">*</span></label><input name="title" id="inv-title" placeholder="单位全称" value="'+esc(inv.title||'')+'" required/></div>'
    +'<div class="form-group"><label>税号</label><input name="taxId" placeholder="统一社会信用代码" value="'+esc(inv.taxId||'')+'"/></div>'
    +'<div class="form-group"><label>开票类目</label><input name="category" list="inv-cat-list" placeholder="选择或输入" autocomplete="off" value="'+esc(inv.category||'')+'"/><datalist id="inv-cat-list">'+catOpts+'</datalist></div>'
    +'<div class="form-group"><label>发票类型</label><select name="invType"><option value="增值税普通发票"'+(inv.invType==='增值税普通发票'?' selected':'')+'>增值税普通发票</option><option value="增值税专用发票"'+(inv.invType==='增值税专用发票'?' selected':'')+'>增值税专用发票</option></select></div>'
    +'<div class="form-group"><label>开票金额 <span style="color:red">*</span></label><input type="number" name="amount" placeholder="0.00" value="'+(inv.amount||'')+'" required/></div>'
    +'<div class="form-group"><label>我方开票单位</label><input name="ourUnit" list="inv-unit-list" placeholder="选择或输入" autocomplete="off" value="'+esc(inv.ourUnit||'')+'"/><datalist id="inv-unit-list">'+unitOpts+'</datalist></div>'
    +'<div class="form-group full"><label>备注</label><textarea name="rk" rows="2" placeholder="选填开票备注">'+esc(inv.rk||'')+'</textarea></div>'
    +'</div></form>';
  showModal('修改开票申请',body,function(){
    var f=getFormData('inv-form');
    if(!f.salesperson||!f.bn||!f.title||!f.amount){toast('请填写必填项（业务员、业务编号、受票方、开票金额）','error');return;}
    if(curRole==='sales'){
      var foundOrder=null;
      for(var oi=0;oi<DB_ORDERS.length;oi++){
        if(DB_ORDERS[oi].bn===f.bn){foundOrder=DB_ORDERS[oi];break;}
      }
      if(!foundOrder){toast('业务编号不存在，请检查','error');return;}
      if(foundOrder.sl!==curUser.name&&foundOrder.ac!==curUser.account){toast('您只能为自己名下的订单申请开票','error');return;}
    }
    // 保留原有 id、状态、审批信息
    f.id=inv.id;
    f.status=inv.status;
    f.appliedBy=inv.appliedBy;
    f.appliedAt=inv.appliedAt;
    f.approvedBy=inv.approvedBy||'';
    f.approvedAt=inv.approvedAt||'';
    f.invFile=inv.invFile||'';
    // 更新记录
    for(var i=0;i<DB_INVOICES.length;i++){
      if(DB_INVOICES[i].id===inv.id){
        DB_INVOICES[i]=f;
        break;
      }
    }
    syncAll();
    renderInvoicePage();
    renderApprovalPage();
    toast('开票申请已修改');
    closeAllModals();
  },{title:'修改开票申请',okText:'保存修改'});
}
// 删除开票记录（admin可删除任意记录；申请人可删除自己的记录）
function deleteInvoiceRecord(id){
  var inv=null;
  for(var i=0;i<DB_INVOICES.length;i++){if(DB_INVOICES[i].id===id){inv=DB_INVOICES[i];break;}}
  if(!inv){toast('记录不存在','error');return;}
  if(curRole!=='admin'&&inv.appliedBy!==curUser.name){
    toast('无权操作','error');return;
  }
  confirmDialog('确定删除该开票记录？',function(){
    // 清理关联订单的 invStatus
    if(inv.bn){
      var hasOther=DB_INVOICES.some(function(x){return x.bn===inv.bn&&x.id!==id});
      if(!hasOther){
        for(var oi=0;oi<DB_ORDERS.length;oi++){
          if(DB_ORDERS[oi].bn===inv.bn){delete DB_ORDERS[oi].invStatus;break;}
        }
      }
    }
    DB_INVOICES=DB_INVOICES.filter(function(x){return x.id!==id});
    syncAll();
    renderInvoicePage();
    renderApprovalPage();
    addNotification('开票记录已删除','info');
    toast('开票记录已删除');
  },{title:'删除开票记录',okText:'确认删除'});
}

function exportAddress(){
  if(curRole!=='admin'&&curRole!=='finance'){toast('无权操作','error');return;}
  var headers=['类型','地址','房间号','状态','业务编号','单位名称','业务员','客户昵称',
    '开始时间','结束时间','续费状态','收款金额','收款账号','收款时间','法人','联系电话','是否异常'];
  var rows=DB_ADDRESS.map(function(a){
    return [a.t||'',a.ad||'',a.rm||'',a.bn?'已占用':'空置',a.bn||'',a.co||'',a.sl||'',a.nn||'',
      a.sd||'',a.ed||'',a.rs||'',a.pm||0,a.pa||'',a.pd||'',a.lp||'',a.ph||'',a.ex||''];
  });
  var totalPm=0,occupy=0;
  for(var i=0;i<DB_ADDRESS.length;i++){totalPm+=DB_ADDRESS[i].pm||0;if(DB_ADDRESS[i].bn)occupy++;}
  var summary=[['地址汇总报告','','','','','','','','','','','','','','','','']];
  summary.push(['总地址数','已占用','空置','总收款金额','']);
  summary.push([DB_ADDRESS.length,occupy,DB_ADDRESS.length-occupy,totalPm,'']);
  downloadExcel(headers,rows,'地址数据',[{name:'汇总',data:summary}]);
}

function exportOrders(){
  if(curRole!=='admin'&&curRole!=='finance'){toast('无权操作','error');return;}
  var headers=['母订单编号','单位名称','业务员','客户昵称','子订单编号','业务类型','地址','房间号',
    '报价','收款金额','收款时间','收款账号','成本','收益','内勤','备注'];
  var rows=[];
  var totalPm=0,totalPr=0,totalCost=0,totalProfit=0;
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(o.items&&o.items.length>0){
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        var btLabel=BT_MAP[it.bt]||it.bt||'';
        var profit=(it.pm||0)-(it.cost||0);
        rows.push([o.bn||'',o.co||'',o.sl||'',o.nn||'',it.subBn||'',btLabel,
          it.ad||'',it.rm||'',it.pr||0,it.pm||0,it.pd||'',it.pa||'',it.cost||0,profit,o.nq||'',o.rm||'']);
        totalPm+=it.pm||0;totalPr+=it.pr||0;totalCost+=it.cost||0;totalProfit+=profit;
      }
    }else{
      rows.push([o.bn||'',o.co||'',o.sl||'',o.nn||'','(无子订单)','','','',0,0,'','',0,0,o.nq||'',o.rm||'']);
    }
  }
  var summary=[['订单汇总报告']];
  summary.push(['总订单数','总报价','总收款','总成本','总收益']);
  summary.push([DB_ORDERS.length,totalPr,totalPm,totalCost,totalProfit]);
  downloadExcel(headers,rows,'订单数据',[{name:'汇总',data:summary}]);
}

function exportCustomers(){
  if(curRole!=='admin'&&curRole!=='finance'){toast('无权操作','error');return;}
  var headers=['客户公司','客户昵称','微信','联系电话','对接账号','业务员','首次成交','客户类型','标签','关联订单数','总收款'];
  var rows=DB_CUSTOMERS.map(function(c){
    var oc=0,pm=0;
    for(var j=0;j<DB_ORDERS.length;j++){var o=DB_ORDERS[j];if(o.nn===c.nn){oc++;sumOrder(o);pm+=o.pm_total||0;}}
    return [c.co||'',c.nn||'',c.wx||'',c.phone||c.ph||'',c.ac||'',c.sl||'',c.fd||'',c.tp||'',c.tags||'',oc,pm];
  });
  var totalPm=0;for(var i=0;i<DB_CUSTOMERS.length;i++){for(var j=0;j<DB_ORDERS.length;j++){if(DB_ORDERS[j].nn===DB_CUSTOMERS[i].nn){sumOrder(DB_ORDERS[j]);totalPm+=DB_ORDERS[j].pm_total||0;}}}
  var summary=[['客户汇总报告']];
  summary.push(['总客户数','总收款金额']);
  summary.push([DB_CUSTOMERS.length,totalPm]);
  downloadExcel(headers,rows,'客户数据',[{name:'汇总',data:summary}]);
}

// ========== 批量导入 ==========
function openImportModal(){
  openBatchImportModal('地址','addr');
}
function openOrderImportModal(){
  openBatchImportModal('订单','order');
}
function openCustImportModal(){
  openBatchImportModal('客户','cust');
}
// 经营报表导出
function exportBusinessReport(){
  if(typeof XLSX==='undefined'){toast('Excel库加载中...','error');return;}
  // 计算期间
  var now=new Date(),ym=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var ordersThisMonth=DB_ORDERS.filter(function(o){return o.od&&o.od.indexOf(ym)===0});
  // 本月KPI
  var monthIncome=0,monthOrders=0,monthProfit=0;
  for(var i=0;i<ordersThisMonth.length;i++){sumOrder(ordersThisMonth[i]);monthIncome+=ordersThisMonth[i].pm_total||0;monthOrders++;}
  var monthCost=0;
  for(var i=0;i<DB_EXPENSES.length;i++)if(DB_EXPENSES[i].xf||DB_EXPENSES[i].xm)monthCost+=DB_EXPENSES[i].xm||0;
  monthProfit=monthIncome-monthCost;
  // 总累计
  var totalIncome=0;
  for(var i=0;i<DB_ORDERS.length;i++){sumOrder(DB_ORDERS[i]);totalIncome+=DB_ORDERS[i].pm_total||0;}
  var totalExp=0;
  for(var i=0;i<DB_EXPENSES.length;i++)if(DB_EXPENSES[i].xf||DB_EXPENSES[i].xm)totalExp+=DB_EXPENSES[i].xm||0;
  // 待办
  var pendingInv=(DB_INVOICES||[]).filter(function(x){return x.status==='pending'}).length;
  var renewCount=0;
  for(var i=0;i<DB_ADDRESS.length;i++){var a=DB_ADDRESS[i];calcAddrActualRenewStatus(a);if(a.rd<=30||a.ex==='是')renewCount++;}
  // Sheet1: 经营概况
  var summaryData=[
    ['经营报表 - '+ym,'',''],
    ['','',''],
    ['【本月概况】','',''],
    ['本月订单数',monthOrders,'单'],
    ['本月收入',monthIncome,'元'],
    ['本月支出',monthCost,'元'],
    ['本月利润',monthProfit,'元'],
    ['','',''],
    ['【累计概况】','',''],
    ['累计订单',DB_ORDERS.length,'单'],
    ['累计收入',totalIncome,'元'],
    ['累计支出',totalExp,'元'],
    ['累计客户',DB_CUSTOMERS.length,'个'],
    ['地址总数',DB_ADDRESS.length,'个'],
    ['','',''],
    ['【待办事项】','',''],
    ['待审批开票',pendingInv,'条'],
    ['待续费地址',renewCount,'个'],
  ];
  // Sheet2: 本月订单明细
  var ordHeaders=['业务编号','客户昵称','业务员','收款金额','订单日期'];
  var ordRows=ordersThisMonth.map(function(o){
    return [o.bn||'',o.nn||'',o.sl||'',o.pm_total||0,o.od||''];
  });
  // Sheet3: 本月支出明细  
  var expHeaders=['业务编号','单位','类型','金额','时间'];
  var expThisMonth=DB_EXPENSES.filter(function(e){return e.pfTime&&e.pfTime.indexOf(ym)===0});
  var expRows=expThisMonth.map(function(e){
    return [e.bn||'',e.co||'',e.bt||'',e.xm||0,e.pfTime||''];
  });
  var wb=XLSX.utils.book_new();
  var ws1=XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols']=[{wch:20},{wch:15},{wch:8}];
  XLSX.utils.book_append_sheet(wb,ws1,'经营概况');
  var ws2=XLSX.utils.aoa_to_sheet([ordHeaders].concat(ordRows));
  ws2['!cols']=[{wch:18},{wch:12},{wch:10},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws2,'本月订单');
  var ws3=XLSX.utils.aoa_to_sheet([expHeaders].concat(expRows));
  ws3['!cols']=[{wch:18},{wch:16},{wch:10},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws3,'本月支出');
  XLSX.writeFile(wb,'经营报表_'+ym+'.xlsx');
  toast('经营报表已导出');
}
function openBatchImportModal(label,type){
  showModal('批量导入'+label,
    '<div style="font-size:13px;color:#666;margin-bottom:10px">请上传符合模板格式的Excel文件。可先点击「📥 下载模板」下载参考模板。</div>'
    +'<div class="form-group"><label>选择Excel文件</label>'
    +'<input type="file" id="import-file" class="form-input" accept=".xlsx,.xls" style="width:100%;padding:8px"></div>'
    +'<div id="import-preview" style="font-size:12px;color:#888;margin-top:6px"></div>',
    function(){
      var fileInput=document.getElementById('import-file');
      if(!fileInput||!fileInput.files[0]){toast('请选择文件','error');return false;}
      var file=fileInput.files[0];
      var btn=document.querySelector('#modal-confirm');
      btn.disabled=true;
      btn.textContent='⏳ 解析中...';
      var reader=new FileReader();
      reader.onload=function(e){
        try{
          var data=new Uint8Array(e.target.result);
          var wb=XLSX.read(data,{type:'array'});
          var ws=wb.Sheets[wb.SheetNames[0]];
          var json=XLSX.utils.sheet_to_json(ws,{defval:''});
          if(!json||json.length===0){toast('文件中没有数据','error');btn.disabled=false;btn.textContent='确认';return false;}
          var result=doBatchImport(type,json);
          btn.disabled=false;
          btn.textContent='确认';
          if(result.ok){
            toast('✅ 成功导入 '+result.count+' 条'+label+'数据');
            closeModal();
            // 刷新对应页面
            if(type==='addr')renderAddressTable();
            else if(type==='order')renderOrdersTable();
            else if(type==='cust')renderCustomerTable();
          }else{
            toast('❌ '+result.error,'error');
          }
        }catch(err){
          btn.disabled=false;
          btn.textContent='确认';
          toast('❌ 解析失败: '+err.message,'error');
        }
      };
      reader.readAsArrayBuffer(file);
      return false;
    }, false);
}

function doBatchImport(type,rows){
  var count=0,errors=[];
  var defaultSl=curUser&&curUser.name?curUser.name:'';
  var defaultAc='';
  var curCustomers=DB_CUSTOMERS||[];

  if(type==='addr'){
    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      var addr=((r['地址']||r['ad']||'')+'').trim();
      var room=((r['房间号']||r['rm']||'')+'').trim();
      if(!addr&&!room)continue;
      var co=((r['单位名称']||r['co']||'')+'').trim();
      var sl=((r['业务员']||r['sl']||'')+'').trim()||defaultSl;
      var nn=((r['客户昵称']||r['nn']||'')+'').trim();
      var lp=((r['法人']||r['lp']||'')+'').trim();
      var ph=((r['联系电话']||r['ph']||'')+'').trim();
      DB_ADDRESS.push({
        id:Date.now()+'_'+count+'_'+Math.random().toString(36).slice(2,6),
        ad:addr,rm:room,co:co,sl:sl,nn:nn,lp:lp,ph:ph,
        t:((r['类型']||r['t']||'')+'').trim()||'写字楼',
        sd:'',ed:'',bn:'',pm:0,pa:'',pd:'',ex:'',rs:'',rd:0,remainDays:0
      });
      count++;
    }
  }else if(type==='order'){
    // 按业务编号分组：同一母订单的多行合并
    var orderMap={};
    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      var bn=((r['母订单编号']||r['业务编号']||r['bn']||'')+'').trim();
      if(!bn)continue;
      var sl=((r['业务员']||r['sl']||'')+'').trim()||defaultSl;
      var nn=((r['客户昵称']||r['nn']||'')+'').trim();
      var co=((r['单位名称']||r['co']||'')+'').trim();
      var subBn=((r['子订单编号']||r['subBn']||'')+'').trim();
      var btRaw=((r['业务类型']||r['bt']||'')+'').trim().toLowerCase();
      var bt=btRaw==='续费'?'renew':'sale';
      var pm=parseFloat(r['收款金额']||r['pm']||0)||0;
      var cost=parseFloat(r['成本']||r['cost']||0)||0;
      var addr=((r['地址']||r['ad']||'')+'').trim();
      var room=((r['房间号']||r['rm']||'')+'').trim();
      var profit=pm-cost;
      if(!orderMap[bn]){
        orderMap[bn]={bn:bn,co:co,sl:sl,nn:nn,ic:0,
          pm_total:0,cost_total:0,profit_total:0,
          nq:'',rm:'',items:[],od:new Date().toISOString().slice(0,10)};
      }
      var item={subBn:subBn,bt:bt,pm:pm,cost:cost,profit:profit,
        ad:addr,rm:room,pr:0,co:co,bn:bn};
      orderMap[bn].items.push(item);
      orderMap[bn].pm_total+=pm;
      orderMap[bn].cost_total+=cost;
      orderMap[bn].profit_total+=profit;
      orderMap[bn].ic=(orderMap[bn].items||[]).length;
    }
    for(var k in orderMap){
      DB_ORDERS.push(orderMap[k]);
      count++;
    }
  }else if(type==='cust'){
    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      var nn=((r['客户昵称']||r['nn']||'')+'').trim();
      if(!nn)continue;
      var co=((r['客户公司']||r['co']||'')+'').trim();
      var wx=((r['微信']||r['wx']||'')+'').trim();
      var ph=((r['联系电话']||r['ph']||'')+'').trim();
      var ac=((r['对接账号']||r['ac']||'')+'').trim();
      var sl=((r['业务员']||r['sl']||'')+'').trim()||defaultSl;
      var ct=((r['客户类型']||r['ct']||'')+'').trim()||'新客户';
      // 检查是否已存在（按昵称+业务员去重）
      var exists=false;
      for(var j=0;j<curCustomers.length;j++){
        if(curCustomers[j].nn===nn&&curCustomers[j].sl===sl){exists=true;break;}
      }
      if(exists){errors.push(nn+'（已存在）');continue;}
      DB_CUSTOMERS.push({
        id:Date.now()+'_'+count,
        co:co,nn:nn,wx:wx,ph:ph,ac:ac,sl:sl,ct:ct
      });
      count++;
    }
  }

  syncAll();
  return {ok:true,count:count,errors:errors};
}

function downloadAddrTemplate(){
  var headers=['类型','地址','房间号','状态','业务编号','单位名称','业务员','客户昵称',
    '开始时间','结束时间','续费状态','收款金额','收款账号','收款时间','法人','联系电话','是否异常'];
  var rows=[['写字楼','示例大厦A座','1001室','已占用','BN2026001','示例公司','张三','张先生',
    '2026-01-01','2026-12-31','正常',12000,'微信','2026-01-01','张三','13800138000','否']];
  downloadExcel(headers,rows,'地址导入模板');
}

function downloadOrderTemplate(){
  var headers=['母订单编号','单位名称','业务员','客户昵称','子订单编号','业务类型','地址','房间号',
    '报价','收款金额','收款时间','收款账号','成本','内勤','备注'];
  var rows=[['BN2026001','杭州测试有限公司','张三','张先生','BN2026001-01','销售',
    '铂瑞悦府2幢','1001室',5000,5000,'2026-01-01','微信',200,'盛佳缘','']];
  downloadExcel(headers,rows,'订单导入模板');
}

function downloadExpTemplate(){
  var headers=['支出时间','业务编号','业务员','单位名称','地址','子订单','支出金额','支出账号','成本','备注'];
  var rows=[['2026-01-01','BN2026001','张三','杭州测试有限公司','铂瑞悦府2幢1001室','BN2026001-01',5000,'微信',200,'']];
  downloadExcel(headers,rows,'支出导入模板');
}
function downloadCustTemplate(){
  var headers=['客户公司','客户昵称','微信','联系电话','对接账号','业务员','首次成交','客户类型'];
  var rows=[['示例公司','张先生','zhangsan_wx','13800138000','zhangsan@wx','张三','2026-01-01','新客户']];
  downloadExcel(headers,rows,'客户导入模板');
}

// ========== 工资计算 ==========
function renderSalaryPage(){
  fillMonthSel('salary-filter-month');fillSalesSel('salary-filter-sales');
  var fm=$('salary-filter-month').value,fs=$('salary-filter-sales').value;
  var isMgmt=(curRole==='admin'||curRole==='finance'||curRole==='gm');
  // 按母订单分组：遍历所有有已确认收款的子订单，按母订单合并
  var orderMap={}; // key: o.id, value: {ordBn,sales,items:[{bt,pm,item}],totalPm,comm,commissionSet}
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(fm&&(!o.od||o.od.substring(0,7)!==fm))continue;
    if(fs&&o.sl!==fs)continue;
    if(!isMgmt&&o.sl!==curUser.name)continue;
    if(!o.items)continue;
    var hasConfirmed=false;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      // 只统计有已确认收款的子订单
      var pm=0;
      var payRecs=it.pr_records||[];
      if(payRecs.length>0){
        for(var pi=0;pi<payRecs.length;pi++){
          if(payRecs[pi].pf&&!payRecs[pi].prej) pm+=(payRecs[pi].pm||0);
        }
      }else if(it.pm>0&&it.pd){
        pm=it.pm||0;
      }
      if(pm<=0)continue;
      // 计算利润 = 收款 - 成本 - 已确认支出
      var profit=pm-(it.cost||0);
      var xrRecs=it.xr||[];
      for(var xi=0;xi<xrRecs.length;xi++){
        if(xrRecs[xi].xf) profit-=(parseFloat(xrRecs[xi].xm)||0);
      }
      // 利润可为负值，不强制归零
      hasConfirmed=true;
      if(!orderMap[o.id])orderMap[o.id]={ordBn:o.bn,sales:o.sl,totalPm:0,totalProfit:0,items:[],_saleRate:null,_renewRate:null,order:o};
      orderMap[o.id].items.push({bt:it.bt,pm:pm,profit:profit,item:it,subBn:it.subBn});
      orderMap[o.id].totalPm+=pm;
      orderMap[o.id].totalProfit+=profit;
      // 记录提成比例（取第一个有设置的子订单，否则用业务员默认）
      if(orderMap[o.id]._saleRate===null)orderMap[o.id]._saleRate=it._saleRate||null;
      if(orderMap[o.id]._renewRate===null)orderMap[o.id]._renewRate=it._renewRate||null;
    }
  }
  // 转换为数组
  var orderArr=[];for(var k in orderMap)orderArr.push(orderMap[k]);
  orderArr.sort(function(a,b){return a.ordBn<b.ordBn?-1:1});
  // 计算每个母订单的总佣金
  for(var i=0;i<orderArr.length;i++){
    var om=orderArr[i];
    var u=DB_USERS.find(function(x){return x.name===om.sales});
    var saleRate=om._saleRate||(u?u.commissionSale:18);
    var renewRate=om._renewRate||(u?u.commissionRenew:15);
    om.saleRate=saleRate;om.renewRate=renewRate;
    // 按子订单类型分别计算佣金（基于利润）
    var totalComm=0;
    for(var j=0;j<om.items.length;j++){
      var it=om.items[j];
      var rate=it.bt==='renew'?renewRate:saleRate;
      totalComm+=Math.round(it.profit*rate/100);
    }
    om.comm=totalComm;
  }
  // 汇总统计
  var totalSalary=0,salesCount=0,sm={};
  for(var i=0;i<orderArr.length;i++){
    var om=orderArr[i];
    totalSalary+=om.comm;
    if(!sm[om.sales])sm[om.sales]={totalPm:0,totalProfit:0,totalComm:0,sCnt:0,rCnt:0};
    sm[om.sales].totalPm+=om.totalPm;
    sm[om.sales].totalProfit+=om.totalProfit;
    sm[om.sales].totalComm+=om.comm;
    for(var j=0;j<om.items.length;j++){
      var it=om.items[j];
      if(it.bt==='renew')sm[om.sales].rCnt++;
      else sm[om.sales].sCnt++;
    }
  }
  for(var k in sm)salesCount++;
  $('salary-total').textContent=fmtM(totalSalary);
  $('salary-avg').textContent=salesCount>0?fmtM(Math.round(totalSalary/salesCount)):'0';
  $('salary-count').textContent=salesCount+'人';
  // 工资明细表 - 扁平化显示（参照财务支出表格样式）
  var flatRows=[];
  for(var i=0;i<orderArr.length;i++){
    var om=orderArr[i];
    for(var j=0;j<om.items.length;j++){
      var it=om.items[j];
      var btLabel=it.bt==='renew'?'地址续费':'地址销售';
      var btTagCls=it.bt==='renew'?'tag-green':'tag-blue';
      var rate=it.bt==='renew'?om.renewRate:om.saleRate;
      var comm=Math.round(it.profit*rate/100);
      var expTotal=0;
      if(it.item.xr){for(var xi=0;xi<it.item.xr.length;xi++){if(it.item.xr[xi].xf)expTotal+=(parseFloat(it.item.xr[xi].xm)||0);}}
      // 收款时间：取第一个已确认收款记录的日期
      var pd='';
      if(it.item.pr_records&&it.item.pr_records.length>0){
        for(var pi=0;pi<it.item.pr_records.length;pi++){if(it.item.pr_records[pi].pf){pd=it.item.pr_records[pi].pd||it.item.pr_records[pi].pf;break;}}
      }
      if(!pd)pd=it.item.pd||'';
      flatRows.push({
        ordBn:om.ordBn, subBn:it.subBn||'--', sales:om.sales,
        bt:btLabel, pm:it.pm, cost:it.item.cost||0,
        exp:expTotal, profit:it.profit, rate:rate, comm:comm,
        pd:pd, oid:om.order.id
      });
    }
  }
  // 筛选+排序
  window._salaryData=flatRows;
  flatRows=applyTableFilter(flatRows,_salaryFilters,_salarySort,_salaryCtx);
  updateHeaderIndicators($('salary-tbody').parentNode,_salaryFilters,_salarySort);
  // 计算母订单编号合并行数
  var bnPageCount={};
  for(var i=0;i<flatRows.length;i++){var bn=flatRows[i].ordBn||'';if(!bnPageCount[bn])bnPageCount[bn]=0;bnPageCount[bn]++;}
  // 渲染表格（母订单编号合并单元格）
  var tbHtml='',bnRendered={};
  for(var i=0;i<flatRows.length;i++){
    var r=flatRows[i];
    var bg=i%2===0?'background:#fff':'background:#fefce8';
    var rateBtn=isMgmt?'<button class="btn-view" onclick="setOrderCommissionRate('+r.oid+')" style="padding:2px 6px;font-size:11px">设置</button>':'<span style="color:#9ca3af;font-size:11px">只读</span>';
    var bn=r.ordBn||'';
    tbHtml+='<tr style="border-bottom:1px solid #fde68a;'+bg+'">'
      +'<td style="text-align:center;color:#888;font-size:12px;padding:6px 8px">'+(i+1)+'</td>';
    if(!bnRendered[bn])bnRendered[bn]=0;
    if(bnRendered[bn]===0){
      tbHtml+='<td style="padding:6px 8px;font-weight:600" rowspan="'+bnPageCount[bn]+'"><a href="#" onclick="showOrderDetailByBn(\''+esc(bn)+'\');return false" style="color:var(--blue);text-decoration:underline">'+esc(bn)+'</a></td>';
    }
    bnRendered[bn]++;
    tbHtml+='<td style="padding:6px 8px;font-size:12px;color:#374151">'+esc(r.subBn)+'</td>'
      +'<td style="padding:6px 8px">'+esc(r.sales)+'</td>'
      +'<td style="padding:6px 8px"><span class="'+(r.bt==='地址续费'?'tag-green':'tag-blue')+'" style="font-size:11px">'+r.bt+'</span></td>'
      +'<td style="padding:6px 8px;font-size:12px;color:#6b7280;white-space:nowrap">'+esc(r.pd)+'</td>'
      +'<td style="padding:6px 8px;text-align:right;font-weight:600;color:#059669">'+fmtM(r.pm)+'</td>'
      +'<td style="padding:6px 8px;text-align:right;color:#6b7280">'+fmtM(r.cost)+'</td>'
      +'<td style="padding:6px 8px;text-align:right;color:#dc2626">'+fmtM(r.exp)+'</td>'
      +'<td style="padding:6px 8px;text-align:right;font-weight:600;color:'+(r.profit<0?'#dc2626':'#059669')+'">'+fmtM(r.profit)+'</td>'
      +'<td style="padding:6px 8px;text-align:center;font-size:12px;color:#6b7280">'+r.rate+'%</td>'
      +'<td style="padding:6px 8px;text-align:right;font-weight:600;color:#059669">'+fmtM(r.comm)+'</td>'
      +'<td style="padding:6px 8px;text-align:center">'+rateBtn+'</td>'
      +'</tr>';
  }
  $('salary-tbody').innerHTML=tbHtml||'<tr><td colspan="13" class="empty-state"><p>暂无已收款的订单</p></td></tr>';
  // 业务员月度汇总表
  var sumHtml='';
  var sumArr=[];for(var k in sm)sumArr.push({n:k,sCnt:sm[k].sCnt,rCnt:sm[k].rCnt,totalProfit:sm[k].totalProfit,totalComm:sm[k].totalComm});
  sumArr.sort(function(a,b){return b.totalComm-a.totalComm});
  for(var i=0;i<sumArr.length;i++){
    var s=sumArr[i];
    sumHtml+='<tr><td style="text-align:center!important"><strong>'+esc(s.n)+'</strong></td><td style="text-align:center!important">'+s.sCnt+'单</td><td style="text-align:center!important">'+s.rCnt+'单</td><td style="text-align:center!important" class="num-income">'+fmtM(s.totalProfit)+'</td><td style="text-align:center!important;font-weight:600" class="num-profit">'+fmtM(s.totalComm)+'</td></tr>';
  }
  $('salary-summary-tbody').innerHTML=sumHtml||'<tr><td colspan="5" class="empty-state"><p>暂无</p></td></tr>';
}
// 设置母订单提成比例（显示子订单表格，每行可单独修改）
function setOrderCommissionRate(oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid});
  if(!o){toast('订单不存在','error');return;}
  var u=DB_USERS.find(function(x){return x.name===o.sl});
  var defaultSale=u?u.commissionSale:18,defaultRenew=u?u.commissionRenew:15;
  // 生成子订单表格
  var tableHtml='<table style="width:100%;border-collapse:collapse;font-size:13px">'
    +'<thead><tr style="background:#f3f4f6">'
    +'<th style="padding:8px;text-align:center">子订单编号</th>'
    +'<th style="padding:8px;text-align:center">类型</th>'
    +'<th style="padding:8px;text-align:center">收款金额</th>'
    +'<th style="padding:8px;text-align:center">利润</th>'
    +'<th style="padding:8px;text-align:center">当前提成%</th>'
    +'<th style="padding:8px;text-align:center">新提成%</th>'
    +'</tr></thead><tbody>';
  var itemCount=0;
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      var pm=0;
      var payRecs=it.pr_records||[];
      if(payRecs.length>0){for(var pi=0;pi<payRecs.length;pi++){if(payRecs[pi].pf&&!payRecs[pi].prej)pm+=(payRecs[pi].pm||0);}}
      else if(it.pm>0&&it.pd)pm=it.pm||0;
      if(pm<=0)continue;
      // 利润
      var profit=pm-(it.cost||0);
      var xrRecs=it.xr||[];
      for(var xi=0;xi<xrRecs.length;xi++){if(xrRecs[xi].xf)profit-=(parseFloat(xrRecs[xi].xm)||0);}
      // 当前提成比例
      var curRate=it.bt==='renew'?(it._renewRate||defaultRenew):(it._saleRate||defaultSale);
      var btLabel=it.bt==='renew'?'地址续费':'地址销售';
      var btTag=it.bt==='renew'?'tag-green':'tag-blue';
      var rateLabel=it.bt==='renew'?'续费':'销售';
      tableHtml+='<tr style="border-bottom:1px solid #e5e7eb">'
        +'<td style="padding:6px;text-align:center">'+esc(it.subBn||'--')+'</td>'
        +'<td style="padding:6px;text-align:center"><span class="'+btTag+'" style="font-size:11px">'+btLabel+'</span></td>'
        +'<td style="padding:6px;text-align:center">¥'+pm.toFixed(0)+'</td>'
        +'<td style="padding:6px;text-align:center;'+(profit<0?'color:#dc2626':'color:#059669')+'">¥'+profit.toFixed(0)+'</td>'
        +'<td style="padding:6px;text-align:center">'+rateLabel+' '+curRate+'%</td>'
        +'<td style="padding:6px;text-align:center"><input type="number" class="ci-item-rate" data-idx="'+i+'" data-bt="'+it.bt+'" value="'+curRate+'" min="0" max="100" style="width:70px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;text-align:center;font-size:13px"/>%</td>'
        +'</tr>';
      itemCount++;
    }
  }
  tableHtml+='</tbody></table>';
  if(itemCount===0){toast('该订单暂无已收款的子订单','error');return;}
  // 底部统一设置快捷操作
  tableHtml+='<div style="margin-top:10px;padding:8px;background:#f9fafb;border-radius:6px;display:flex;align-items:center;gap:8px">'
    +'<span style="font-size:12px;color:#6b7280">统一设置：</span>'
    +'<input type="number" id="ci-unified-rate" placeholder="提成%" style="width:80px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;text-align:center"/>'
    +'<select id="ci-unified-type" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:13px"><option value="sale">销售</option><option value="renew">续费</option><option value="all">全部</option></select>'
    +'<button class="btn-primary" onclick="applyUnifiedRate()" style="padding:4px 12px;font-size:12px">应用</button>'
    +'</div>';
  showModal('设置提成比例 - '+esc(o.bn),tableHtml,function(){
    // 收集所有新提成比例并应用
    var inputs=document.querySelectorAll('.ci-item-rate');
    var applied=false;
    for(var i=0;i<inputs.length;i++){
      var inp=inputs[i];
      var idx=parseInt(inp.dataset.idx);
      var bt=inp.dataset.bt;
      var newRate=parseFloat(inp.value)||0;
      if(o.items&&o.items[idx]){
        if(bt==='renew')o.items[idx]._renewRate=newRate;
        else o.items[idx]._saleRate=newRate;
        applied=true;
      }
    }
    if(applied){
      syncAll();
      toast('已更新子订单提成比例');
      renderSalaryPage();
    }else{toast('未找到可修改的子订单','error');}
    closeAllModals();
  });
}
// 统一应用提成比例（快捷操作）
function applyUnifiedRate(){
  var rate=parseFloat(document.getElementById('ci-unified-rate').value);
  if(!rate||rate<=0){toast('请输入有效比例','error');return;}
  var type=document.getElementById('ci-unified-type').value;
  var inputs=document.querySelectorAll('.ci-item-rate');
  for(var i=0;i<inputs.length;i++){
    var inp=inputs[i];
    if(type==='all'||inp.dataset.bt===type)inp.value=rate;
  }
}
// 旧版提成比例设置（按业务员，保留兼容）
// 选择业务员时同步提成比例输入框
function syncCmRates(){
  var sel=document.getElementById('cm-sales-select');
  var opt=sel.options[sel.selectedIndex];
  if(opt&&opt.value){
    document.getElementById('cm-sale-rate').value=opt.dataset.sale;
    document.getElementById('cm-renew-rate').value=opt.dataset.renew;
  }
}
function syncCiRates(){
  var sel=document.getElementById('ci-sub-select');
  var opt=sel.options[sel.selectedIndex];
  if(opt&&opt.value){
    document.getElementById('ci-sale-rate').value=opt.dataset.sale;
    document.getElementById('ci-renew-rate').value=opt.dataset.renew;
  }
}
function openCommissionRateModal(salesName){
  if(!salesName){
    // 未指定业务员时，弹窗选择业务员
    var opts='<option value="">请选择业务员</option>';
    var salesList=DB_USERS.filter(function(u){return u.role==='sales'});
    for(var i=0;i<salesList.length;i++){
      var u=salesList[i];
      opts+='<option value="'+esc(u.name)+'" data-sale="'+(u.commissionSale||18)+'" data-renew="'+(u.commissionRenew||15)+'">'+esc(u.name)+' (销售'+(u.commissionSale||18)+'%/续费'+(u.commissionRenew||15)+'%)</option>';
    }
    showModal('选择业务员',
      '<div class="form-group"><label>选择要设置默认提成比例的业务员</label><select id="cm-sales-select" onchange="syncCmRates()" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px">'+opts+'</select></div>'
      +'<div class="form-grid" style="margin-top:12px"><div class="form-group"><label>销售提成%</label><input type="number" id="cm-sale-rate" value="18" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;box-sizing:border-box"/></div>'
      +'<div class="form-group"><label>续费提成%</label><input type="number" id="cm-renew-rate" value="15" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:6px;box-sizing:border-box"/></div></div>',
      function(){
        var sel=document.getElementById('cm-sales-select');
        if(!sel.value){toast('请选择业务员','error');return;}
        var u=DB_USERS.find(function(x){return x.name===sel.value});
        if(!u){toast('用户不存在','error');return;}
        u.commissionSale=parseFloat(document.getElementById('cm-sale-rate').value)||0;
        u.commissionRenew=parseFloat(document.getElementById('cm-renew-rate').value)||0;
        syncAll();
        toast('已更新 '+esc(u.name)+' 的默认提成比例');
        renderSalaryPage();
      }
    );
    return;
  }
  var u=DB_USERS.find(function(x){return x.name===salesName});
  if(!u){toast('用户不存在','error');return;}
  var curSaleRate=u.commissionSale||18,curRenewRate=u.commissionRenew||15;
  showModal('设置提成比例 - '+esc(salesName),
    '<div style="font-size:13px">'
    +'<div class="form-group"><label>地址销售提成比例</label><div style="display:flex;align-items:center;gap:4px"><input type="number" id="sale-rate-input" value="'+curSaleRate+'" min="0" max="100" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px"/> <span>%</span></div></div>'
    +'<div class="form-group" style="margin-top:12px"><label>地址续费提成比例</label><div style="display:flex;align-items:center;gap:4px"><input type="number" id="renew-rate-input" value="'+curRenewRate+'" min="0" max="100" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px"/> <span>%</span></div></div>'
    +'</div>',
    function(){
      var saleRate=parseFloat(document.getElementById('sale-rate-input').value)||0;
      var renewRate=parseFloat(document.getElementById('renew-rate-input').value)||0;
      u.commissionSale=saleRate;
      u.commissionRenew=renewRate;
      syncAll();
      toast('已更新 '+esc(salesName)+' 的提成比例');
      renderSalaryPage();
    }
  );
}


function getExps(){
  var batchMap={};
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];
    if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var records=it.xr||[];
      for(var k=0;k<records.length;k++){
        var rec=records[k];
        if(!rec.xf)continue; // 未确认的跳过
        var bid=rec.batchId||o.id+'_'+j+'_'+k;
        if(!batchMap[bid])batchMap[bid]={batchId:bid,bn:o.bn,pfTime:rec.xf,sl:o.sl,co:it.co||o.co,xm:0,cost:0,bt:it.bt||o.bt,rk:rec.rk||'',expAccount:rec.xa_actual||'',
          subBns:[],addr:it.addr||'',xrRecs:[],_o:o,_it:it,img:'',voucherImg:'',xf_user:rec.xf_user||'',xrej_user:rec.xrej_user||''};
        var bm=batchMap[bid];
        bm.xm+=(rec.xm_actual||rec.xm||0);
        bm.cost+=it.cost||0;
        // 取该子订单的收款时间
        if(!bm.payTime&&it.pr_records){
          for(var pri=0;pri<it.pr_records.length;pri++){if(it.pr_records[pri].pf){bm.payTime=it.pr_records[pri].pd||it.pr_records[pri].pf;break;}}
          if(!bm.payTime)bm.payTime=it.pd||'';
        }
        if(!bm.img&&rec.xi&&rec.xi.trim()!=='')bm.img=rec.xi;
        if(!bm.voucherImg&&rec.xi_voucher&&rec.xi_voucher.trim()!=='')bm.voucherImg=rec.xi_voucher;
        if(bm.subBns.indexOf(it.subBn)===-1)bm.subBns.push(it.subBn);
        bm.xrRecs.push({subIdx:j,recIdx:k});
      }
    }
  }
  var exps=[];for(var k in batchMap)exps.push(batchMap[k]);
  return exps;
}
// 按batchId批量删除支出记录（关联所有子批次）
function deleteExpenseBatch(batchId){
  if(curRole!=='admin'&&curRole!=='finance'&&curRole!=='gm'){toast('无权删除','error');return;}
  confirmDialog('确定删除整笔支出记录？',function(){
    var deleted=0;
    for(var i=0;i<DB_ORDERS.length;i++){
      var o=DB_ORDERS[i];
      if(!o.items)continue;
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        if(!it.xr)continue;
        for(var k=it.xr.length-1;k>=0;k--){
          if(it.xr[k].batchId===batchId||(!it.xr[k].batchId&&it.xr[k].xf)){
            it.xr.splice(k,1);
            deleted++;
          }
        }
        if(it.xr.length===0)delete it.xr;
      }
      if(o.items)sumOrder(o);
    }
    if(deleted===0){toast('没有可删除的记录','error');return;}
    syncAll();
    renderExpensesTable();
    toast('已删除'+deleted+'条记录');
  },{title:'删除支出',okText:'确认删除'});
}
// 收入/支出详情弹窗
function showIncomeDetail(batchId){
  var batch=null;
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var recs=it.pr_records||[];
      for(var k=0;k<recs.length;k++){if(recs[k].batchId===batchId){batch={o:o,it:it,rec:recs[k],bn:o.bn,subBn:it.subBn,co:it.co||o.co,addr:it.addr,pm:recs[k].pm,cost:it.cost,bt:it.bt||o.bt,pf:recs[k].pf,pa:recs[k].pa||it.pa,rk:recs[k].rk};break;}}
      if(batch)break;
    }
    if(batch)break;
  }
  if(!batch){toast('记录不存在','error');return;}
  var pf=typeof batch.pf==='string'?batch.pf:batch.pf.substring(0,10);
  var h='<div style="font-size:13px;line-height:1.8">'
    +'<p><strong>业务编号：</strong>'+esc(batch.bn)+'</p>'
    +'<p><strong>子订单编号：</strong>'+esc(batch.subBn)+'</p>'
    +'<p><strong>单位名称：</strong>'+esc(batch.co)+'</p>'
    +'<p><strong>地址：</strong>'+esc(batch.addr)+'</p>'
    +'<p><strong>业务类型：</strong>'+esc(batch.bt)+'</p>'
    +'<p><strong>收款金额：</strong><span style="color:#059669;font-weight:600">'+fmtM(batch.pm)+'</span></p>'
    +'<p><strong>成本：</strong>'+fmtM(batch.cost)+'</p>'
    +'<p><strong>收款时间：</strong>'+esc(pf)+'</p>'
    +'<p><strong>收款账号：</strong>'+esc(batch.pa||'-')+'</p>'
    +'<p><strong>备注：</strong>'+esc(batch.rk||'-')+'</p></div>';
  showModal('收款详情',h,null);
}
function deleteIncomeBatch(batchId){
  if(curRole!=='admin'&&curRole!=='finance'&&curRole!=='gm'){toast('无权删除','error');return;}
  // 判断是否为无 batchId 的老数据虚拟 key（格式：{oid}_{subIdx}_{recIdx}）
  var pbMatch = /^(\d+)_(\d+)_(\d+)$/.exec(batchId);
  confirmDialog('确定删除整笔收款记录？将同时删除相关子订单的付款信息',function(){
    var deleted=0;
    for(var i=0;i<DB_ORDERS.length;i++){
      var o=DB_ORDERS[i];
      if(!o.items)continue;
      for(var j=0;j<o.items.length;j++){
        var it=o.items[j];
        if(!it.pr_records)continue;
        for(var k=it.pr_records.length-1;k>=0;k--){
          var rec=it.pr_records[k];
          // 优先按 batchId 精确匹配，无 batchId 的老数据按 oid+子订单索引+记录索引匹配
          var match = rec.batchId===batchId;
          if(!match && pbMatch){
            match = (o.id==parseInt(pbMatch[1]) && j===parseInt(pbMatch[2]) && k===parseInt(pbMatch[3]));
          }
          if(!match) continue;
          it.pr_records.splice(k,1);
          deleted++;
          // 如果删除后pr_records为空，清除子订单收款标记
          if(it.pr_records.length===0){delete it.pr_records;it.pm=0;it.pd='';}
        }
      }
      if(o.items)sumOrder(o);
    }
    if(deleted===0){toast('没有可删除的记录','error');return;}
    syncAll();
    renderIncomeTable();
    toast('已删除');
  },{title:'删除收款',okText:'确认删除'});
}

// 按子订单显示收款详情
function showIncomeDetailBySub(subBn, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items)return;
  var it=null;
  for(var j=0;j<o.items.length;j++){if(o.items[j].subBn===subBn){it=o.items[j];break;}}
  if(!it){toast('子订单不存在','error');return;}
  var pm=0,pf='',pa='',rk='',pxi='';
  var recs=it.pr_records||[];
  for(var k=0;k<recs.length;k++){
    var rec=recs[k];
    if(rec.pf&&!rec.prej){pm+=rec.pm||0;if(!pf)pf=rec.pf;if(!pa)pa=rec.pa||'';if(!rk)rk=rec.rk||'';if(!pxi)pxi=rec.pxi||'';}
  }
  if(!pm&&!it.pd){toast('无收款记录','error');return;}
  if(!pf)pf=it.pd||'';
  if(!pa)pa=it.pa||'';
  if(!rk)rk='';
  var h='<div style="font-size:13px;line-height:1.8">'
    +'<p><strong>业务编号：</strong>'+esc(o.bn)+'</p>'
    +'<p><strong>子订单编号：</strong>'+esc(subBn)+'</p>'
    +'<p><strong>单位名称：</strong>'+esc(it.co||o.co)+'</p>'
    +'<p><strong>地址：</strong>'+esc(it.addr||'')+'</p>'
    +'<p><strong>业务类型：</strong>'+esc(it.bt||o.bt)+'</p>'
    +'<p><strong>收款金额：</strong><span style="color:#059669;font-weight:600">'+fmtM(pm)+'</span></p>'
    +'<p><strong>成本：</strong>'+fmtM(it.cost||0)+'</p>'
    +'<p><strong>收款时间：</strong>'+esc(pf)+'</p>'
    +'<p><strong>收款账号：</strong>'+esc(pa||'-')+'</p>'
    +(pxi?'<p><strong>凭证截图：</strong></p>'+renderImgThumbs(pxi,'width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:pointer;margin:3px;border:1px solid #e2e8f0;'):'')
    +'<p><strong>备注：</strong>'+esc(rk||'-')+'</p></div>';
  showModal('收款详情',h,null);
}
// 按子订单查看支出记录
function showIncomeExpTime(subBn, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items)return;
  var it=null;
  for(var j=0;j<o.items.length;j++){if(o.items[j].subBn===subBn){it=o.items[j];break;}}
  if(!it){toast('子订单不存在','error');return;}
  var h='<div style="font-size:13px;line-height:1.8">'
    +'<p><strong>业务编号：</strong>'+esc(o.bn)+'</p>'
    +'<p><strong>子订单编号：</strong>'+esc(subBn)+'</p>'
    +'<p><strong>单位名称：</strong>'+esc(it.co||o.co)+'</p>'
    +'<p><strong>地址：</strong>'+esc(it.addr||'')+'</p>'
    +'<p><strong>业务类型：</strong>'+esc(it.bt||o.bt)+'</p>'
    +'<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">'
    +'<tr style="background:#fef3c7;font-weight:600"><td style="padding:6px 8px;border:1px solid #fde68a">支出时间</td><td style="padding:6px 8px;border:1px solid #fde68a">支出金额</td><td style="padding:6px 8px;border:1px solid #fde68a">支出账号</td><td style="padding:6px 8px;border:1px solid #fde68a">备注</td></tr>';
  var xrRecs=it.xr||[];
  var hasExp=false;
  for(var k=0;k<xrRecs.length;k++){
    var rec=xrRecs[k];
    if(!rec.xf)continue;
    hasExp=true;
    h+='<tr><td style="padding:4px 8px;border:1px solid #fde68a">'+esc(rec.xf)+'</td>'
      +'<td style="padding:4px 8px;border:1px solid #fde68a;text-align:right;color:#d97706;font-weight:600">'+(rec.xm_actual||rec.xm||0)+'</td>'
      +'<td style="padding:4px 8px;border:1px solid #fde68a">'+esc(rec.xa_actual||'')+'</td>'
      +'<td style="padding:4px 8px;border:1px solid #fde68a">'+esc(rec.rk||'')+'</td></tr>';
  }
  h+='</table>';
  if(!hasExp)h+='<p style="color:#999;margin-top:8px">暂无支出记录</p>';
  h+='</div>';
  showModal('支出明细',h,null);
}

// 按子订单删除所有收款记录
function deleteIncomeSub(subBn, oid, subIdx){
  if(curRole!=='admin'&&curRole!=='finance'&&curRole!=='gm'){toast('无权删除','error');return;}
  confirmDialog('确定删除此子订单的所有收款记录？',function(){
    var o=DB_ORDERS.find(function(x){return x.id===oid;});
    if(!o||!o.items||!o.items[subIdx]){toast('数据异常','error');return;}
    var it=o.items[subIdx];
    if(!it.pr_records||it.pr_records.length===0){toast('没有可删除的记录','error');return;}
    it.pr_records=[];
    it.pm=0;it.pd='';it.pa='';it.ppm='';
    sumOrder(o);
    syncAll();
    renderIncomeTable();
    toast('已删除');
  },{title:'删除收款',okText:'确认删除'});
}

function showExpenseDetail(batchId){
  var detail=null;
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var xrs=it.xr||[];
      for(var k=0;k<xrs.length;k++){
        if(xrs[k].batchId===batchId){
          detail={o:o,it:it,rec:xrs[k],bn:o.bn,subBn:it.subBn,co:it.co||o.co,addr:it.addr,xm:xrs[k].xm_actual||xrs[k].xm,bt:it.bt||o.bt,xf:xrs[k].xf,xa:xrs[k].xa_actual||'',rk:xrs[k].rk,xi:xrs[k].xi||'',xi_voucher:xrs[k].xi_voucher||''};
          break;
        }
      }
      if(detail)break;
    }
    if(detail)break;
  }
  if(!detail){toast('记录不存在','error');return;}
  var h='<div style="font-size:13px;line-height:1.8">'
    +'<p><strong>业务编号：</strong>'+esc(detail.bn)+'</p>'
    +'<p><strong>子订单编号：</strong>'+esc(detail.subBn)+'</p>'
    +'<p><strong>单位名称：</strong>'+esc(detail.co)+'</p>'
    +'<p><strong>地址：</strong>'+esc(detail.addr)+'</p>'
    +'<p><strong>业务类型：</strong>'+esc(detail.bt)+'</p>'
    +'<p><strong>支出金额：</strong><span style="color:#d97706;font-weight:600">'+fmtM(detail.xm)+'</span></p>'
    +'<p><strong>支出时间：</strong>'+esc(detail.xf)+'</p>'
    +'<p><strong>支出账号：</strong>'+esc(detail.xa||'-')+'</p>'
    +(detail.xi?'<p><strong>申请截图：</strong></p>'+renderImgThumbs(detail.xi,'width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:pointer;margin:3px;border:1px solid #e2e8f0;'):'')
    +(detail.xi_voucher?'<p style="margin-top:8px"><strong>审批凭证：</strong></p>'+renderImgThumbs(detail.xi_voucher,'width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:pointer;margin:3px;border:1px solid #e2e8f0;'):'')
    +'<p><strong>备注：</strong>'+esc(detail.rk||'-')+'</p></div>';
  showModal('支出详情',h,null);
}
// 按batchId查看对应收款记录
function showExpPayTime(batchId){
  var detail=null;
  for(var i=0;i<DB_ORDERS.length;i++){
    var o=DB_ORDERS[i];if(!o.items)continue;
    for(var j=0;j<o.items.length;j++){
      var it=o.items[j];
      var xrs=it.xr||[];
      for(var k=0;k<xrs.length;k++){
        if(xrs[k].batchId===batchId){
          detail={o:o,it:it,bn:o.bn,subBn:it.subBn,co:it.co||o.co,addr:it.addr};
          break;
        }
      }
      if(detail)break;
    }
    if(detail)break;
  }
  if(!detail){toast('未找到对应收款记录','error');return;}
  var h='<div style="font-size:13px;line-height:1.8">'
    +'<p><strong>业务编号：</strong>'+esc(detail.bn)+'</p>'
    +'<p><strong>子订单编号：</strong>'+esc(detail.subBn)+'</p>'
    +'<p><strong>单位名称：</strong>'+esc(detail.co)+'</p>'
    +'<p><strong>地址：</strong>'+esc(detail.addr)+'</p>'
    +'<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">'
    +'<tr style="background:#d1fae5;font-weight:600"><td style="padding:6px 8px;border:1px solid #a7f3d0">收款时间</td><td style="padding:6px 8px;border:1px solid #a7f3d0">收款金额</td><td style="padding:6px 8px;border:1px solid #a7f3d0">收款账号</td><td style="padding:6px 8px;border:1px solid #a7f3d0">备注</td></tr>';
  var payRecs=detail.it.pr_records||[];
  var hasPay=false;
  for(var k=0;k<payRecs.length;k++){
    var rec=payRecs[k];
    if(!rec.pf)continue;
    hasPay=true;
    h+='<tr><td style="padding:4px 8px;border:1px solid #a7f3d0">'+esc(rec.pd||rec.pf)+'</td>'
      +'<td style="padding:4px 8px;border:1px solid #a7f3d0;text-align:right;color:#059669;font-weight:600">'+(rec.pm||0)+'</td>'
      +'<td style="padding:4px 8px;border:1px solid #a7f3d0">'+esc(rec.pa||'')+'</td>'
      +'<td style="padding:4px 8px;border:1px solid #a7f3d0">'+esc(rec.rk||'')+'</td></tr>';
  }
  h+='</table>';
  if(!hasPay)h+='<p style="color:#999;margin-top:8px">暂无收款记录</p>';
  h+='</div>';
  showModal('收款明细',h,null);
}
function renderExpensesTable(){
  fillMonthSel('exp-filter-month');var fm=$('exp-filter-month').value,fa=$('exp-filter-account').value;
  var exps=getExps();
  if(curRole==='sales')exps=exps.filter(function(e){return e.sl===curUser.name});
  if(fm)exps=exps.filter(function(e){return e.pfTime&&e.pfTime.substring(0,7)===fm});
  if(fa)exps=exps.filter(function(e){return e.expAccount===fa});
  exps=applyTableFilter(exps,_expFilters,_expSort,_expCtx);
  updateHeaderIndicators($('expenses-tbody').parentNode,_expFilters,_expSort);
  var te=exps.reduce(function(s,e){return s+(e.xm||0)},0),tac=exps.reduce(function(s,e){return s+(e.cost||0)},0),oe=Math.max(te-tac,0);
  $('exp-total').textContent=fmtM(te);$('exp-address-cost').textContent=fmtM(tac);$('exp-other').textContent=fmtM(oe);
  var acSet=new Set();for(var i=0;i<exps.length;i++)acSet.add(exps[i].expAccount);var accArr=[];acSet.forEach(function(a){accArr.push(a)});
  var sel=$('exp-filter-account'),cv=sel.value;sel.innerHTML='<option value="">\u5168\u90e8\u8d26\u53f7</option>'+accArr.map(function(a){return '<option value="'+a+'"'+(a===cv?' selected':'')+'>'+a+'</option>'}).join('');
  var tpp=Math.ceil(exps.length/PS)||1;if(ep>tpp)ep=tpp;var pd=exps.slice((ep-1)*PS,ep*PS);
  var btTag={'\u5730\u5740\u9500\u552e':'tag-blue','\u5730\u5740\u7eed\u8d39':'tag-green'};var html='';
  for(var i=0;i<pd.length;i++){
    var e=pd[i];
    var bg=i%2===0?'background:#fff':'background:#fefce8';
    html+='<tr style="border-bottom:1px solid #fde68a;'+bg+'">'
      +'<td style="text-align:center;color:#888;font-size:12px">'+((ep-1)*PS+i+1)+'</td>'
      +'<td style="padding:6px 8px"><a href="#" onclick="showOrderDetailByBn(\''+esc(e.bn)+'\');return false" style="color:#3b82f6;text-decoration:underline">'+esc(e.bn)+'</a></td>'
      +'<td style="padding:6px 8px">'+esc(e.subBns.join('、'))+'</td>'
      +'<td style="padding:6px 8px"><span class="'+(btTag[e.bt]||'')+'" style="font-size:11px">'+esc(e.bt)+'</span></td>'
      +'<td style="padding:6px 8px">'+esc(e.sl)+'</td>'
      +'<td style="padding:6px 8px" title="'+esc(e.co)+'">'+esc(e.co)+'</td>'
      +'<td style="padding:6px 8px"><a href="#" onclick="showExpenseDetail(\''+esc(e.batchId)+'\');return false" style="color:var(--blue);text-decoration:underline">'+esc((e.pfTime||'').split(' ')[0])+'</a></td>'
      +'<td style="padding:6px 8px">'+esc(e.expAccount)+'</td>'
      +'<td style="padding:6px 8px;font-weight:600;color:#d97706">'+fmtM(e.xm)+'</td>'
      +'<td style="padding:6px 8px;color:#6b7280">'+fmtM(e.cost)+'</td>'
      +'<td style="padding:6px 8px">'
      +(e.img?renderImgThumbs(e.img,'width:28px;height:28px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;'):'<span style="color:#ccc;font-size:10px">-</span>')
      +'</td>'
      +'<td style="padding:6px 8px">'
      +(e.voucherImg?renderImgThumbs(e.voucherImg,'width:28px;height:28px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;'):'<span style="color:#ccc;font-size:10px">-</span>')
      +'</td>'
      +'<td style="padding:6px 8px;font-size:11px;color:#6b7280;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(e.rk)+'">'+esc(e.rk||'-')+'</td>'
      +'<td style="padding:6px 8px;color:#374151">'+esc(e.xf_user||e.xrej_user||'-')+'</td>'
      +'<td class="td-actions">'
      +'<button type="button" class="btn-view" style="padding:2px 6px;font-size:11px" onclick="showExpenseDetail(\''+esc(e.batchId)+'\')">详情</button>'
      +(curRole==='admin'||curRole==='finance'||curRole==='gm'
        ?'<button type="button" class="btn-danger" style="padding:2px 6px;font-size:11px" onclick="deleteExpenseBatch(\''+esc(e.batchId)+'\')">删除</button>'
        :'')
      +'</td></tr>';
  }
  $('expenses-tbody').innerHTML=html||'<tr><td colspan="15" class="empty-state"><p class="empty-text">暂无数据</p></td></tr>';
  buildPg($('expenses-pagination'),tpp,ep,function(p){ep=p;renderExpensesTable()});
}

// 管理员/财务删除财务支出记录（从订单子项的xr中移除）
function deleteExpenseRecord(oid, subIdx, recIdx){
  if(curRole!=='admin'&&curRole!=='finance'&&curRole!=='gm'){
    toast('无权删除','error');return;
  }
  confirmDialog('确定删除这笔支出记录？',function(){
    var o=DB_ORDERS.find(function(x){return x.id===oid;});
    if(!o||!o.items||!o.items[subIdx]){toast('数据异常','error');return;}
    var it=o.items[subIdx];
    var records=it.xr||[];
    if(!records[recIdx]){toast('记录不存在','error');return;}
    records.splice(recIdx,1);
    if(records.length===0) it.xr=[];
    sumOrder(o);
    syncAll();
    toast('支出记录已删除');
    renderExpensesTable();
  },{title:'删除支出记录',okText:'确认删除'});
}

function openExpModal(){
  showModal('\u65b0\u589e\u652f\u51fa',
    '<form id="ef"><div class="form-grid"><div class="form-group"><label>\u65f6\u95f4</label><input type="date" name="xd" value="'+todayStr()+'"/></div><div class="form-group"><label>\u652f\u51fa\u8d26\u53f7</label><input name="xa"/></div><div class="form-group"><label>\u6536\u6b3e\u65b9</label><input name="xt"/></div><div class="form-group"><label>\u91d1\u989d</label><input type="number" name="xm"/></div><div class="form-group"><label>\u5173\u8054\u8ba2\u5355\u7f16\u53f7</label><input name="bn" placeholder="\u8f93\u5165\u8ba2\u5355\u7f16\u53f7"/></div><div class="form-group"><label>\u5907\u6ce8</label><input name="rk"/></div></div></form>',
    function(){var f=getFormData('ef');if(!f.xm||f.xm<=0){toast('\u8bf7\u8f93\u5165\u91d1\u989d','error');return}
      if(f.bn){
        var found=false;
        for(var i=0;i<DB_ORDERS.length;i++){
          var o=DB_ORDERS[i];
          if(o.bn===f.bn){
            found=true;
            if(o.items&&o.items.length>0){
              var it=o.items[0];
              if(!it.xr)it.xr=[];
              var batchId='exp_batch_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
              it.xr.push({
                batchId:batchId,xd:f.xd,xm:parseFloat(f.xm)||0,
                xa_actual:f.xa||'',payee:f.xt||'',rk:f.rk||'',
                xf:new Date().toISOString().slice(0,10),expAccount:f.xa||''
              });
            }else{
              if(!o.items)o.items=[];
              var newItem={addr:'',co:o.co||'',subBn:o.bn+'-1',xr:[],pr_records:[]};
              var batchId='exp_batch_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
              newItem.xr.push({
                batchId:batchId,xd:f.xd,xm:parseFloat(f.xm)||0,
                xa_actual:f.xa||'',payee:f.xt||'',rk:f.rk||'',
                xf:new Date().toISOString().slice(0,10),expAccount:f.xa||''
              });
              o.items.push(newItem);
            }
            toast('\u652f\u51fa\u5df2\u5173\u8054\u5230\u8ba2\u5355 '+f.bn);break;
          }
        }
        if(!found)toast('\u672a\u627e\u5230\u8ba2\u5355\u7f16\u53f7: '+f.bn,'error');
      }else{toast('\u8bf7\u8f93\u5165\u5173\u8054\u8ba2\u5355\u7f16\u53f7','error');}
      syncAll();closeAllModals();renderExpensesTable();
    });
}

// 母订单支出申请弹窗 - 选择母订单或子订单
var _pendingExpParent={};
function openExpFromParent(oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  _pendingExpParent.oid=oid;
  
  // === 收集所有子订单的支出申请记录并按batchId分组 ===
  var expAllRecords=[];
  if(o.items){
    for(var vi=0;vi<o.items.length;vi++){
      var vit=o.items[vi];
      var xrArr=vit.xr||[];
      for(var vj=0;vj<xrArr.length;vj++){
        var xrec=xrArr[vj];
        var status='submitted';
        var statusText='已提交';
        var statusCls='tag-orange';
        if(xrec.xf){status='approved';statusText='审批通过';statusCls='tag-green';}
        else if(xrec.xrej){status='rejected';statusText='已驳回';statusCls='tag-red';}
        expAllRecords.push({subIdx:vi,it:vit,rec:xrec,recIdx:vj,status:status,statusText:statusText,statusCls:statusCls});
      }
    }
  }
  // 按batchId分组
  var expGroups={}, expGroupOrder=[];
  for(var gi=0;gi<expAllRecords.length;gi++){
    var er=expAllRecords[gi];
    var bid=er.rec.batchId||('__noBatch_'+er.subIdx+'_'+er.recIdx);
    if(!expGroups[bid]){expGroups[bid]=[];expGroupOrder.push(bid);}
    expGroups[bid].push(er);
  }
  // 构建申请记录区域
  var canModifyExp=curRole==='admin'||curRole==='finance'||curRole==='gm';
  var pendingExpArea='';
  pendingExpArea+='<div style="margin-bottom:16px;border:1px solid #fbbf24;border-radius:8px;overflow:hidden;background:#fffbeb">';
  pendingExpArea+='<div style="background:#fef3c7;padding:8px 12px;font-weight:600;font-size:13px;border-bottom:1px solid #fbbf24;display:flex;align-items:center;justify-content:space-between">';
  pendingExpArea+='<span>⚠️ 支出申请记录</span>';
  pendingExpArea+='<span style="background:#f59e0b;color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">'+expGroupOrder.length+'</span>';
  pendingExpArea+='</div>';
  if(expGroupOrder.length>0){
    pendingExpArea+='<div style="max-height:350px;overflow-y:auto">';
    pendingExpArea+='<table id="exp-app-records-table" style="width:100%;border-collapse:collapse;font-size:12px">';
    pendingExpArea+='<thead><tr style="background:#fde68a"><th style="padding:6px 8px;text-align:left;position:relative">时间<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">编号<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">子订单编号<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">单位名称<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">地址<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:right;position:relative">总金额<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:center;position:relative">申请截图<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:center;position:relative">审批凭证<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">备注<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:center;position:relative">状态<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:center;position:relative">操作<span class="col-resizer"></span></th></tr></thead><tbody>';
    for(var gi2=0;gi2<expGroupOrder.length;gi2++){
      var grp=expGroups[expGroupOrder[gi2]];
      var isMulti=grp.length>1;
      var totalGrpAmt=0;
      for(var ta=0;ta<grp.length;ta++) totalGrpAmt+=(grp[ta].rec.xm||0);
      var anyPending=grp.some(function(g){return g.status==='submitted';});
      var anyRejected=grp.some(function(g){return g.status==='rejected';});
      var anyApproved=grp.some(function(g){return g.status==='approved';});
      var groupStatusText=anyPending?'已提交':anyRejected?'已驳回':'审批通过';
      var groupStatusCls=anyPending?'tag-orange':anyRejected?'tag-red':'tag-green';
      // 拼接子订单信息
      var subBns='', coNames='', addrs='';
      for(var si=0;si<grp.length;si++){
        var pe=grp[si];
        subBns+=(si>0?'<br>':'')+esc(pe.it.subBn||('子'+pe.subIdx));
        coNames+=(si>0?'<br>':'')+esc(pe.it.co||'-');
        addrs+=(si>0?'<br>':'')+esc(pe.it.addr||'-');
      }
      var canEdit=canModifyExp||(!anyApproved);
      pendingExpArea+='<tr style="border-bottom:1px solid #fde68a">';
      pendingExpArea+='<td style="padding:6px 8px;font-size:11px;color:#6b7280">'+(grp[0].rec.xd||'-')+'</td>';
      pendingExpArea+='<td style="padding:6px 8px;font-size:11px;color:#1d4ed8">'+(grp[0].rec.expNo||'-')+'</td>';
      pendingExpArea+='<td style="padding:6px 8px">'+subBns+'</td>';
      pendingExpArea+='<td style="padding:6px 8px">'+coNames+'</td>';
      pendingExpArea+='<td style="padding:6px 8px">'+addrs+'</td>';
      pendingExpArea+='<td style="padding:6px 8px;text-align:right;font-weight:600;color:#d97706">¥'+totalGrpAmt.toFixed(2)+'</td>';
      // 申请截图列
      var grpImg='';
      for(var si2=0;si2<grp.length&&!grpImg;si2++){
        var pe2=grp[si2];
        if(pe2.rec.xi&&pe2.rec.xi.trim()!=='') grpImg=pe2.rec.xi;
      }
      pendingExpArea+='<td style="padding:6px 8px;text-align:center">';
      if(grpImg){
        pendingExpArea+=renderImgThumbs(grpImg,'width:30px;height:30px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;');
      }else{
        pendingExpArea+='<span style="color:#ccc;font-size:10px">-</span>';
      }
      pendingExpArea+='</td>';
      // 审批凭证列
      var grpVoucherImg='';
      for(var si2v=0;si2v<grp.length&&!grpVoucherImg;si2v++){
        var pe2v=grp[si2v];
        if(pe2v.rec.xi_voucher&&pe2v.rec.xi_voucher.trim()!=='') grpVoucherImg=pe2v.rec.xi_voucher;
      }
      pendingExpArea+='<td style="padding:6px 8px;text-align:center">';
      if(grpVoucherImg){
        pendingExpArea+=renderImgThumbs(grpVoucherImg,'width:30px;height:30px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;border:1px solid #059669;');
      }else{
        pendingExpArea+='<span style="color:#ccc;font-size:10px">-</span>';
      }
      pendingExpArea+='</td>';
      // 备注列（整组共用一条备注）
      var grpRemark='';
      for(var si3=0;si3<grp.length&&!grpRemark;si3++){
        var pe3=grp[si3];
        if(pe3.rec.rk) grpRemark=esc(pe3.rec.rk);
        if(!grpRemark&&pe3.rec.xrej) grpRemark='驳回：'+esc(pe3.rec.xrej);
      }
      pendingExpArea+='<td style="padding:6px 8px;font-size:11px;color:#6b7280;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+grpRemark+'">'+(grpRemark||'-')+'</td>';
      pendingExpArea+='<td style="padding:6px 8px;text-align:center"><span class="'+groupStatusCls+'" style="font-size:11px">'+groupStatusText+'</span></td>';
      pendingExpArea+='<td style="padding:6px 8px;text-align:center">';
      if(canEdit&&(!anyApproved||canModifyExp)){
        pendingExpArea+='<button type="button" style="padding:2px 6px;font-size:11px;background:#3b82f6;color:#fff;border-radius:4px;margin-right:2px" onclick="event.stopPropagation();editExpBatch(\''+expGroupOrder[gi2]+'\','+o.id+')">修改</button>';
        pendingExpArea+='<button type="button" style="padding:2px 6px;font-size:11px;background:#ef4444;color:#fff;border-radius:4px" onclick="event.stopPropagation();deleteExpRecordByBatch(\''+expGroupOrder[gi2]+'\','+o.id+')">删除</button>';
      }else{
        pendingExpArea+='<span style="color:#999;font-size:11px">-</span>';
      }
      pendingExpArea+='</td>';
      pendingExpArea+='</tr>';
    }
    pendingExpArea+='</tbody></table></div>';
  } else {
    pendingExpArea+='<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">暂无申请记录</div>';
  }
  pendingExpArea+='</div>';
  
  // 收集可选子订单（无待审批支出的）
  var selectableSubs=[];
  if(o.items&&o.items.length>0){
    for(var si=0;si<o.items.length;si++){
      var sit=o.items[si];
      var hasPendingExp=(sit.xr&&sit.xr.some(function(r){return !r.xf&&!r.xrej;}));
      if(!hasPendingExp) selectableSubs.push(si);
    }
  }
  
  // 构建选择列表
  // 计算所有子订单已支出总额（从xr记录求和，排除已驳回+待审批）
  var totalExpAmt=0;
  var hasPendingExpInParent=false;
  if(o.items){for(var ti=0;ti<o.items.length;ti++){
    var sit=o.items[ti];
    var xrArr=sit.xr||[];
    for(var xk=0;xk<xrArr.length;xk++){
      if(!xrArr[xk].xrej&&xrArr[xk].xf) totalExpAmt+=(xrArr[xk].xm||0);
      if(!xrArr[xk].xrej&&!xrArr[xk].xf&&xrArr[xk].xm>0) hasPendingExpInParent=true;
    }
  }}
  totalExpAmt=Math.round(totalExpAmt*100)/100;
  var itemList='<div style="max-height:300px;overflow-y:auto;">';
  itemList+='<table id="exp-select-table" style="width:100%;border-collapse:collapse;font-size:13px">';
  itemList+='<thead><tr style="background:#f9fafb"><th style="width:50px;text-align:center;position:relative">选择<span class="col-resizer"></span></th><th style="position:relative">类型<span class="col-resizer"></span></th><th style="position:relative">编号<span class="col-resizer"></span></th><th style="position:relative">单位名称<span class="col-resizer"></span></th><th style="position:relative">地址<span class="col-resizer"></span></th><th style="text-align:right;position:relative">状态<span class="col-resizer"></span></th></tr></thead>';
  itemList+='<tbody>';
  // 母订单选项
  itemList+='<tr style="border-bottom:1px solid #f3f4f6;background:#fffbe6" id="exp-parent-row">';
  itemList+='<td style="padding:8px;text-align:center"><input type="checkbox" id="exp-parent-chk" onchange="onExpParentChkChange(this,'+selectableSubs.length+')"></td>';
  itemList+='<td style="padding:8px"><span class="tag-blue">母订单</span></td>';
  itemList+='<td style="padding:8px;font-weight:600">'+esc(o.bn||'')+'</td>';
  itemList+='<td style="padding:8px">'+esc(o.co||'-')+'</td>';
  itemList+='<td style="padding:8px">-</td>';
  itemList+='<td style="padding:8px;text-align:right">'+(hasPendingExpInParent?'<span class="tag-orange" style="font-size:10px">待审批</span>':'<span style="color:#d97706;font-weight:600">总支出：¥'+totalExpAmt.toFixed(2)+'</span>')+'</td>';
  itemList+='</tr>';
  // 子订单选项
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      var isDisabled=selectableSubs.indexOf(i)===-1;
      var statusText=it.itemStatus==='pending'?'审批中':it.itemStatus==='approved'?'已通过':it.itemStatus==='rejected'?'已驳回':'';
      var statusCls=it.itemStatus==='approved'?'tag-green':it.itemStatus==='rejected'?'tag-red':it.itemStatus==='pending'?'tag-orange':'tag-gray';
      itemList+='<tr style="border-bottom:1px solid #f3f4f6" id="exp-sub-row-'+i+'">';
      itemList+='<td style="padding:8px;text-align:center"><input type="checkbox" name="expSubChk" value="'+i+'" class="exp-sub-chk" '+(isDisabled?'disabled':'')+' onchange="onExpSubChkChange()"></td>';
      itemList+='<td style="padding:8px"><span class="tag-gray">子订单</span></td>';
      itemList+='<td style="padding:8px">'+esc(it.subBn||'')+'</td>';
      itemList+='<td style="padding:8px">'+esc(it.co||'-')+'</td>';
      itemList+='<td style="padding:8px" title="'+esc(it.addr||'')+'">'+esc((it.addr||'-').substring(0,30))+'</td>';
      // 计算子订单实际总支出（从xr记录求和）
      var subTotalExp=0;
      var xrRecs=it.xr||[];
      for(var xk2=0;xk2<xrRecs.length;xk2++){if(!xrRecs[xk2].xrej)subTotalExp+=(xrRecs[xk2].xm||0);}
      itemList+='<td style="padding:8px;text-align:right"><span style="color:#d97706;font-weight:600">'+(isDisabled?'待审批':'¥'+subTotalExp.toFixed(2))+'</span></td>';
      itemList+='</tr>';
    }
  }
  itemList+='</tbody></table></div>';
  var body='<div style="margin-bottom:12px;color:#666;font-size:13px">'
    +'请选择要添加支出记录的订单：<br>'
    +'<span style="color:#10b981">选择母订单：支出金额将分配给所有可选子订单</span><br>'
    +'<span style="color:#666">选择子订单：支出金额将分配给选中的子订单</span>'
    +'</div>'
    +pendingExpArea+'<form id="exp-parent-form">'
    +itemList
    +'</form>';
  showModal('选择订单',body,function(){var checkedSubs=[];
    var chks=document.querySelectorAll('input.exp-sub-chk:checked');
    for(var ci=0;ci<chks.length;ci++) checkedSubs.push(parseInt(chks[ci].value));
    if(checkedSubs.length===0){toast('请至少选择一个子订单','error');return;}
    openExpFromSubs(oid,checkedSubs);
  },true);
  initResizableTable('exp-select-table');
}

// 母订单checkbox变化时，自动勾选/取消所有可选子订单
function onExpParentChkChange(el, count){
  var chks=document.querySelectorAll('input.exp-sub-chk:not(:disabled)');
  for(var ci=0;ci<chks.length;ci++){chks[ci].checked=el.checked;}
}
function onExpSubChkChange(){
  var parentChk=document.getElementById('exp-parent-chk');
  var allChks=document.querySelectorAll('input.exp-sub-chk:not(:disabled)');
  var checkedChks=document.querySelectorAll('input.exp-sub-chk:checked:not(:disabled)');
  if(parentChk) parentChk.checked=(allChks.length===checkedChks.length);
}

// 删除支出申请记录
function deleteExpRecord(oid, subIdx, recIdx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items||!o.items[subIdx]){toast('数据异常','error');return;}
  var it=o.items[subIdx];
  var records=it.xr||[];
  if(!records[recIdx]){toast('记录不存在','error');return;}
  var rec=records[recIdx];
  if(rec.xf&&curRole!=='admin'&&curRole!=='finance'&&curRole!=='gm'){
    toast('已审批通过的记录需管理员或财务才能删除','error');return;
  }
  confirmDialog('确定删除这条支出申请记录？',function(){
    records.splice(recIdx,1);
    it.itemStatus='draft';
    if(records.length===0) it.xr=[];
    sumOrder(o);
    syncAll();
    // 如果订单详情弹窗是打开的，移除它
    var detailOv=document.querySelector('.order-detail-overlay');
    if(detailOv) detailOv.remove();
    renderApprovalPage();renderDashboard();
  },{title:'删除支出申请',okText:'确认删除'});
}

// 按batchId批量删除支出申请记录
function deleteExpRecordByBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 判断是否为无 batchId 的老数据的虚拟 key
  var isNoBatch = batchId && (batchId.indexOf('__noBatch_')===0 || batchId.indexOf('__no_')===0);
  var nbSubIdx = -1, nbRecIdx = -1;
  if(isNoBatch){
    var parts = batchId.split('_');
    nbSubIdx = parseInt(parts[parts.length-2]);
    nbRecIdx = parseInt(parts[parts.length-1]);
  }
  confirmDialog('确定删除整批支出申请记录？',function(){
    var deleted=0;
    if(o.items){
      for(var i=0;i<o.items.length;i++){
        var it=o.items[i];
        if(!it.xr)continue;
        for(var rj=it.xr.length-1;rj>=0;rj--){
          var rec=it.xr[rj];
          var match = rec.batchId===batchId;
          if(!match && isNoBatch){
            match = (i===nbSubIdx && rj===nbRecIdx);
          }
          if(!match) continue;
          if(rec.xf&&curRole!=='admin'&&curRole!=='finance'&&curRole!=='gm'){
            continue;
          }
          it.xr.splice(rj,1);
          it.itemStatus='draft';
          deleted++;
        }
      }
    }
    if(deleted===0){toast('没有可删除的记录','error');return;}
    sumOrder(o);
    syncAll();
    // 如果订单详情弹窗是打开的，移除它
    var detailOv=document.querySelector('.order-detail-overlay');
    if(detailOv) detailOv.remove();
    // 原地刷新弹窗（不关闭）
    var modalOv2=document.getElementById('modal-overlay');
    if(modalOv2&&$('modal-title')&&$('modal-title').textContent==='选择订单'){
      if(document.getElementById('exp-parent-row')){
        openExpFromParent(oid);
      }else if(document.getElementById('pay-parent-row')){
        openPayFromParent(oid);
      }else{
        refreshExpAppTable(oid);
      }
      // 弹出 showModal 刚保存的旧状态，防止点取消后恢复旧数据
      if(window._modalStack&&window._modalStack.length>0){
        window._modalStack.pop();
      }
    }else{
      refreshExpAppTable(oid);
    }
    renderApprovalPage();renderOrdersTable();renderDashboard();
    renderPerformance();renderSalaryPage();renderIncomeTable();renderExpensesTable();
    toast('已删除'+deleted+'条记录');
  },{title:'批量删除',okText:'确认删除'});
}

// 批量支出申请弹窗（参照收款 openPayFromSubs）
function openExpFromSubs(oid, selectedSubs){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  var count=selectedSubs.length;
  
  // 构建子订单金额编辑表格
  var subListHtml='<div style="margin-top:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">';
  subListHtml+='<div style="background:#f9fafb;padding:10px 12px;font-weight:600;font-size:13px;border-bottom:1px solid #e5e7eb">支出明细</div>';
  subListHtml+='<div style="max-height:250px;overflow-y:auto">';
  subListHtml+='<table id="exp-batch-table" style="width:100%;border-collapse:collapse;font-size:12px">';
  subListHtml+='<thead><tr style="background:#f3f4f6">';
  subListHtml+='<th style="padding:8px;text-align:left;position:relative">子订单号<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:left;position:relative">单位名称<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:left;position:relative">地址<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:right;position:relative">支出金额<span class="col-resizer"></span></th>';
  subListHtml+='</tr></thead><tbody>';
  for(var i=0;i<selectedSubs.length;i++){
    var idx=selectedSubs[i];
    var it=o.items[idx];
    if(it){
      subListHtml+='<tr style="border-bottom:1px solid #f3f4f6">';
      subListHtml+='<td style="padding:8px"><span class="tag-gray">'+esc(it.subBn||'子'+idx)+'</span></td>';
      subListHtml+='<td style="padding:8px">'+esc(it.co||'-')+'</td>';
      subListHtml+='<td style="padding:8px" title="'+esc(it.addr||'')+'">'+esc((it.addr||'-').substring(0,15))+'</td>';
      subListHtml+='<td style="padding:8px;text-align:right"><input type="number" id="exp-batch-amt-'+i+'" class="exp-batch-amt" style="width:80px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;text-align:right" placeholder="¥0"/></td>';
      subListHtml+='</tr>';
    }
  }
  subListHtml+='</tbody>';
  subListHtml+='<tfoot><tr style="background:#fef3c7;font-weight:600"><td colspan="3" style="padding:8px;text-align:right">总金额：</td><td style="padding:8px;text-align:right"><span id="exp-batch-total" style="color:#d97706">¥0.00</span></td></tr></tfoot>';
  subListHtml+='</table></div></div>';
  
  var body='<form id="exp-batch-form"><div class="form-grid">'
    +'<div class="form-group"><label>申请时间</label><input type="date" name="expDate" value="'+todayStr()+'"/></div>'
    +'<div class="form-group"><label>支出对象</label><input name="payee" placeholder="请输入收款方"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>支出总金额</label><input type="number" name="totalAmount" id="exp-batch-total-input" placeholder="输入支出总金额" oninput="onExpBatchTotalChange('+count+')"/></div>'
    +'<div class="form-group"><label>支付方式</label><select name="expMethod" id="exp-batch-method" onchange="toggleExpBatchBankInfo(this.value)">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="wechat">微信二维码</option>'
    +'<option value="alipay_qr">支付宝二维码</option>'
    +'<option value="alipay_account">支付宝账号</option>'
    +'<option value="bank">对公账号</option>'
    +'</select></div>'
    +'</div>'
    +'<div id="exp-batch-alipay" style="display:none" class="form-grid">'
    +'<div class="form-group"><label>支付宝账号</label><input type="text" name="alipayAccount" placeholder="账号"/></div>'
    +'<div class="form-group"><label>支付宝姓名</label><input type="text" name="alipayName" placeholder="姓名"/></div>'
    +'</div>'
    +'<div id="exp-batch-bank" style="display:none" class="form-grid">'
    +'<div class="form-group"><label>开户行</label><input type="text" name="bankName" placeholder="如：工商银行深圳分行"/></div>'
    +'<div class="form-group"><label>对公账号</label><input type="text" name="bankAccount" placeholder="账号"/></div>'
    +'<div class="form-group"><label>账户名称</label><input type="text" name="bankHolder" placeholder="账户名称"/></div>'
    +'</div>'
    +'<div class="form-group full"><label>上传凭证</label>'
    +'<input type="file" id="exp-batch-img" accept="image/*" multiple onchange="previewExpImg(this)"/>'
    +'<div id="exp-img-preview" style="display:none;margin-top:8px"></div>'
    +'</div>'
    +'<div class="form-group full"><label>备注</label><input name="remark" placeholder="可选"/></div>'
    +subListHtml
    +'</form>';
  
  showModal('批量支出申请（'+count+'单）',body,function(){
    var f=getFormData('exp-batch-form');
    if(!f.expMethod){toast('请选择支付方式','error');return;}
    var totalAmt=parseFloat(f.totalAmount)||0;
    if(totalAmt<=0){toast('请输入支出总金额','error');return;}
    // 收集各子订单金额
    var amounts=[];
    var actualTotal=0;
    for(var ai=0;ai<count;ai++){
      var amt=parseFloat(document.getElementById('exp-batch-amt-'+ai).value)||0;
      amounts.push(amt);
      actualTotal+=amt;
    }
    actualTotal=Math.round(actualTotal*100)/100;
    if(Math.abs(actualTotal-totalAmt)>0.01){
      toast('各订单金额总和必须等于总金额（差¥'+(actualTotal-totalAmt).toFixed(2)+'）','error');
      return;
    }
    // 构建支付详情
    var pDetail={method:f.expMethod};
    if(f.expMethod==='alipay_account'){
      pDetail.alipayAccount=f.alipayAccount;
      pDetail.alipayName=f.alipayName;
    }else if(f.expMethod==='bank'){
      pDetail.bankName=f.bankName;
      pDetail.bankAccount=f.bankAccount;
      pDetail.bankHolder=f.bankHolder;
    }
    var batchId='exp_batch_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
    var curO=DB_ORDERS.find(function(x){return x.id===oid;});
    if(!curO){toast('订单不存在','error');return;}
    
    var pendingExps=_pendingImgFiles['exp-batch-img']||[];
    var doSaveExpBatch=function(xiVal){
      for(var bi=0;bi<selectedSubs.length;bi++){
        var si=selectedSubs[bi];
        var cit=curO.items[si];
        if(!cit){continue;}
        if(!cit.xr)cit.xr=[];
        var expRecord={
          expNo:genExpNo(curO, cit),
          xd:f.expDate,
          xp:f.expMethod,
          xm:amounts[bi],
          payee:f.payee||'',
          xb:JSON.stringify(pDetail),
          xi:xiVal,
          rk:f.remark||'',
          batchId:batchId
        };
        cit.xr.push(expRecord);
        cit.xd=f.expDate;
        cit.xp=f.expMethod;
        cit.xm=amounts[bi];
        cit.rk=f.remark||'';
        if(cit.itemStatus==='draft'||!cit.itemStatus) cit.itemStatus='pending';
      }
      sumOrder(curO);
      syncAll();
      toast('支出申请已提交，等待审批（共'+selectedSubs.length+'单）');
      closeAllModals();
      renderOrdersTable();
      renderApprovalPage();
    };
    if(pendingExps.length){
      uploadMultipleImages(pendingExps).then(function(urls){
        delete _pendingImgFiles['exp-batch-img'];
        doSaveExpBatch(makeImgUrls(urls));
      }).catch(function(e){console.error('上传失败:',e);doSaveExpBatch('');});
    }else{
      doSaveExpBatch('');
    }
  });
  initResizableTable('exp-batch-table');
}

// 批量支出弹窗中金额输入框变化时自动计算总金额
function onExpBatchTotalChange(count){
  var total=parseFloat(document.getElementById('exp-batch-total-input').value)||0;
  var avg=count>0?Math.round(total/count*100)/100:0;
  for(var i=0;i<count;i++){
    document.getElementById('exp-batch-amt-'+i).value=avg.toFixed(2);
  }
  updateExpBatchTotal(count);
}
function updateExpBatchTotal(count){
  var sum=0;
  for(var i=0;i<count;i++){
    sum+=parseFloat(document.getElementById('exp-batch-amt-'+i).value)||0;
  }
  document.getElementById('exp-batch-total').textContent='¥'+sum.toFixed(2);
}
function toggleExpBatchBankInfo(method){
  document.getElementById('exp-batch-alipay').style.display=(method==='alipay_account'?'':'none');
  document.getElementById('exp-batch-bank').style.display=(method==='bank'?'':'none');
}

// 母订单支出申请弹窗
function openExpFromParentOrder(oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  _currentExpItem={order:o,item:null,idx:-1,isParent:true}; // 保存到全局变量
  var expMethod=o.xp||'';
  var paymentDetail={};
  try{paymentDetail=expMethod?JSON.parse(o.xb||'{}'):{};}catch(e){paymentDetail={};}
  var expImg=o.xi||'';
  var expCreateGid='expCreate_'+oid;
  window._editImgData=window._editImgData||{};
  window._editImgData[expCreateGid]=expImg;
  var alipayInfoDisplay=expMethod==='alipay_account'?'':'display:none';
  var bankInfoDisplay=expMethod==='bank'?'':'display:none';
  var imgUploadDisplay=(expMethod==='wechat'||expMethod==='alipay_qr')?'':'display:none';
  
  // 构建待审批/已驳回的支出记录区域
  var pendingExpHtml='';
  var allExpRecords=[];
  if(o.items){
    for(var exp_i=0;exp_i<o.items.length;exp_i++){
      var expIt=o.items[exp_i];
      var xrArr=expIt.xr||[];
      for(var exp_j=0;exp_j<xrArr.length;exp_j++){
        var xr= xrArr[exp_j];
        allExpRecords.push({it:expIt,rec:xr,subBn:expIt.subBn||('子'+exp_i)});
      }
    }
  }
  var pendingExps=allExpRecords.filter(function(r){return !r.rec.xf&&!r.rec.xrej;});
  var rejectedExps=allExpRecords.filter(function(r){return r.rec.xrej;});
  if(pendingExps.length>0||rejectedExps.length>0){
    pendingExpHtml='<div style="margin-bottom:12px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-size:12px">';
    if(pendingExps.length>0){
      pendingExpHtml+='<div style="background:#fff3cd;padding:4px 10px;font-weight:600;border-bottom:1px solid #e5e7eb">⏳ 待审批支出（'+pendingExps.length+'条）</div>';
      for(var pe=0;pe<pendingExps.length;pe++){
        var per=pendingExps[pe];
        pendingExpHtml+='<div style="padding:4px 10px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center">';
        pendingExpHtml+='<span>'+esc(per.subBn)+' <span style="color:#1d4ed8;font-size:10px">'+(per.rec.expNo||'')+'</span> <span style="color:#9ca3af;font-size:10px">'+(per.rec.xd||'')+'</span> - ¥'+(per.rec.xm||0).toFixed(2)+'</span>';
        pendingExpHtml+='<span style="color:#d97706;font-size:11px">待审批</span></div>';
      }
    }
    if(rejectedExps.length>0){
      pendingExpHtml+='<div style="background:#fef2f2;padding:4px 10px;font-weight:600;border-bottom:1px solid #e5e7eb">❌ 已驳回支出（'+rejectedExps.length+'条）</div>';
      for(var re=0;re<rejectedExps.length;re++){
        var rer=rejectedExps[re];
        pendingExpHtml+='<div style="padding:4px 10px;border-bottom:1px solid #f3f4f6">';
        pendingExpHtml+='<div>'+esc(rer.subBn)+' <span style="color:#1d4ed8;font-size:10px">'+(rer.rec.expNo||'')+'</span> <span style="color:#9ca3af;font-size:10px">'+(rer.rec.xd||'')+'</span> - ¥'+(rer.rec.xm||0).toFixed(2)+'</div>';
        if(rer.rec.xrej) pendingExpHtml+='<div style="color:#dc2626;font-size:11px">驳回：'+esc(rer.rec.xrej)+'</div>';
        pendingExpHtml+='</div>';
      }
    }
    pendingExpHtml+='</div>';
  }
  
  var body=pendingExpHtml+'<form id="exp-item-form"><div class="form-grid">'
    +'<div class="form-group"><label>业务编号</label><input value="'+esc(o.bn||'')+'" disabled style="background:#f5f5f5"/></div>'
    +'<div class="form-group"><label>申请时间</label><input type="date" name="expDate" value="'+(o.xd||todayStr())+'"/></div>'
    +'<div class="form-group"><label>支出对象</label><input name="payee" value="'+esc(o.payee||'')+'" placeholder="请输入收款方"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>支出金额</label><input type="number" name="expAmount" value="'+(o.xm||0)+'" placeholder="请输入支出金额"/></div>'
    +'<div class="form-group"><label>支付方式</label><select name="expMethod" id="exp-method-select" onchange="toggleBankInfo(this.value)">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="wechat"'+(expMethod==='wechat'?' selected':'')+'>微信二维码</option>'
    +'<option value="alipay_qr"'+(expMethod==='alipay_qr'?' selected':'')+'>支付宝二维码</option>'
    +'<option value="alipay_account"'+(expMethod==='alipay_account'?' selected':'')+'>支付宝账号</option>'
    +'<option value="bank"'+(expMethod==='bank'?' selected':'')+'>对公账号</option>'
    +'</select></div>'
    +'</div>'
    +'<div id="alipay-account-info" class="form-grid" style="'+alipayInfoDisplay+'">'
    +'<div class="form-group"><label>支付宝账号</label><input type="text" name="alipayAccount" value="'+(paymentDetail.alipayAccount||'')+'" placeholder="账号"/></div>'
    +'<div class="form-group"><label>支付宝姓名</label><input type="text" name="alipayName" value="'+(paymentDetail.alipayName||'')+'" placeholder="姓名"/></div>'
    +'</div>'
    +'<div id="bank-info" class="form-grid" style="'+bankInfoDisplay+'">'
    +'<div class="form-group"><label>开户行</label><input type="text" name="bankName" value="'+(paymentDetail.bankName||'')+'" placeholder="如：工商银行深圳分行"/></div>'
    +'<div class="form-group"><label>对公账号</label><input type="text" name="bankAccount" value="'+(paymentDetail.bankAccount||'')+'" placeholder="账号"/></div>'
    +'<div class="form-group"><label>账户名称</label><input type="text" name="bankHolder" value="'+(paymentDetail.bankHolder||'')+'" placeholder="账户名称"/></div>'
    +'</div>'
    +'<div id="exp-img-upload" style="'+imgUploadDisplay+'">'
    +'<div class="form-group"><label>上传凭证</label>'
    +'<input type="file" id="exp-img-input" accept="image/*" multiple onchange="previewExpImg(this)"/>'
    +'<div id="exp-img-preview"'+(expImg?'':' style="display:none"')+'>'+(expImg?renderImgThumbs(expImg,'width:80px;height:80px;object-fit:cover;border-radius:4px;margin:3px;border:1px solid #e2e8f0;cursor:pointer;','',true,expCreateGid):'')+'</div>'
    +'</div></div>'
    +'<div class="form-group full"><label>备注</label><input name="remark" value="'+esc(o.rk||'')+'" placeholder="请输入备注"/></div>'
    +'</form>';
  showModal('母订单支出申请',body,function(){
    var curO=DB_ORDERS.find(function(x){return x.id===oid;});
    if(!curO){toast('订单不存在','error');return;}
    var f=getFormData('exp-item-form');
    if(!f.expAmount||f.expAmount<=0){toast('请输入支出金额','error');return}
    if(!f.expMethod){toast('请选择支付方式','error');return}
    // 先上传图片，再保存
    var pendingExps=_pendingImgFiles['exp-img-input']||[];
    var doSaveExp=function(xiVal){
      curO.xd=f.expDate;
      curO.xp=f.expMethod;
      curO.xm=parseFloat(f.expAmount)||0;
      curO.payee=f.payee||'';
      var pDetail={method:f.expMethod};
      if(f.expMethod==='alipay_account'){
        pDetail.alipayAccount=f.alipayAccount;
        pDetail.alipayName=f.alipayName;
      }else if(f.expMethod==='bank'){
        pDetail.bankName=f.bankName;
        pDetail.bankAccount=f.bankAccount;
        pDetail.bankHolder=f.bankHolder;
      }
      curO.xb=JSON.stringify(pDetail);
      curO.xi=xiVal;
      curO.rk=f.remark||'';
      // 改为创建 xr 记录，进入审批流程
      var batchId='exp_batch_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
      if(curO.items&&curO.items.length>0){
        for(var i=0;i<curO.items.length;i++){
          var cit=curO.items[i];
          if(!cit.xr)cit.xr=[];
          cit.xr.push({
            xd:f.expDate,
            xp:f.expMethod,
            xm:parseFloat(f.expAmount)||0,
            payee:f.payee||'',
            xb:JSON.stringify(pDetail),
            xi:xiVal,
            rk:f.remark||'',
            batchId:batchId
          });
          cit.xd=f.expDate;
          cit.xp=f.expMethod;
          cit.xm=parseFloat(f.expAmount)||0;
          cit.payee=f.payee||'';
          cit.xi=xiVal;
          cit.rk=f.remark||'';
          if(cit.itemStatus==='draft'||!cit.itemStatus) cit.itemStatus='pending';
        }
      }
      sumOrder(curO);
      syncAll();
      renderOrdersTable();
      renderApprovalPage();
      toast('母订单支出已提交，等待审批');
      closeAllModals();
    };
    if(pendingExps.length){
      uploadMultipleImages(pendingExps).then(function(urls){
        delete _pendingImgFiles['exp-img-input'];
        var existingUrls=parseImgUrls(window._editImgData[expCreateGid]||"");
        var mergedUrls=existingUrls.concat(urls);
        doSaveExp(makeImgUrls(mergedUrls));
      }).catch(function(e){
        console.error('图片上传失败:',e);
        doSaveExp(window._editImgData?window._editImgData[expCreateGid]||'':'');
      });
    }else{
      doSaveExp(window._editImgData?window._editImgData[expCreateGid]||'':'');
    }
  });
}

// 子订单支出申请弹窗
var _currentExpItem=null; // 全局保存当前操作的子订单
function openExpFromItem(oid,idx){
  for(var i=0;i<DB_ORDERS.length;i++){
    if(DB_ORDERS[i].id===oid){
      var o=DB_ORDERS[i];
      if(!o.items||!o.items[idx])return;
      var it=o.items[idx];
      _currentExpItem={order:o,item:it,idx:idx}; // 保存到全局变量
      var expMethod=it.xp||'';
      var paymentDetail={};
      try{paymentDetail=expMethod?JSON.parse(it.xb||'{}'):{};}catch(e){paymentDetail={};}
      var expImg=it.xi||'';
      var expCreateGid='expCreate_'+oid+'_'+idx;
      window._editImgData=window._editImgData||{};
      window._editImgData[expCreateGid]=expImg;
      var alipayInfoDisplay=expMethod==='alipay_account'?'':'display:none';
      var bankInfoDisplay=expMethod==='bank'?'':'display:none';
      var imgUploadDisplay=(expMethod==='wechat'||expMethod==='alipay_qr')?'':'display:none';
      // 构建待审批/已驳回的支出记录区域
      var pendingExpHtml='';
      var expRecs=it.xr||[];
      var hasPending=expRecs.some(function(r){return !r.xf&&!r.xrej;});
      var hasRejected=expRecs.some(function(r){return r.xrej;});
      if(hasPending||hasRejected){
        pendingExpHtml='<div style="margin-bottom:12px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;font-size:12px">';
        if(hasPending){
          pendingExpHtml+='<div style="background:#fff3cd;padding:4px 10px;font-weight:600;border-bottom:1px solid #e5e7eb">⏳ 待审批支出</div>';
          for(var pi=0;pi<expRecs.length;pi++){
            var per2=expRecs[pi];
            if(!per2.xf&&!per2.xrej) pendingExpHtml+='<div style="padding:4px 10px;border-bottom:1px solid #f3f4f6"><span style="color:#1d4ed8;font-size:10px">'+(per2.expNo||'')+'</span> <span style="color:#9ca3af;font-size:10px">'+(per2.xd||'')+'</span> ¥'+(per2.xm||0).toFixed(2)+' <span style="color:#d97706;font-size:11px">待审批</span></div>';
          }
        }
        if(hasRejected){
          pendingExpHtml+='<div style="background:#fef2f2;padding:4px 10px;font-weight:600;border-bottom:1px solid #e5e7eb">❌ 已驳回支出</div>';
          for(var rj=0;rj<expRecs.length;rj++){
            var rer2=expRecs[rj];
            if(rer2.xrej) pendingExpHtml+='<div style="padding:4px 10px;border-bottom:1px solid #f3f4f6"><span style="color:#1d4ed8;font-size:10px">'+(rer2.expNo||'')+'</span> <span style="color:#9ca3af;font-size:10px">'+(rer2.xd||'')+'</span> ¥'+(rer2.xm||0).toFixed(2)+'<br><span style="color:#dc2626;font-size:11px">驳回：'+esc(rer2.xrej)+'</span></div>';
          }
        }
        pendingExpHtml+='</div>';
      }
      var body=pendingExpHtml+'<form id="exp-item-form"><div class="form-grid">'
        +'<div class="form-group"><label>子订单编号</label><input value="'+esc(it.subBn||'')+'" disabled style="background:#f5f5f5"/></div>'
        +'<div class="form-group"><label>申请时间</label><input type="date" name="expDate" value="'+(it.xd||todayStr())+'"/></div>'
        +'<div class="form-group"><label>支出对象</label><input name="payee" value="'+esc(it.payee||'')+'" placeholder="请输入收款方"/></div>'
        +'</div><div class="form-grid">'
        +'<div class="form-group"><label>支出金额</label><input type="number" name="expAmount" value="'+(it.xm||0)+'" placeholder="请输入支出金额"/></div>'
        +'<div class="form-group"><label>支付方式</label><select name="expMethod" id="exp-method-select" onchange="toggleBankInfo(this.value)">'
        +'<option value="">-- 请选择 --</option>'
        +'<option value="wechat"'+(expMethod==='wechat'?' selected':'')+'>微信二维码</option>'
        +'<option value="alipay_qr"'+(expMethod==='alipay_qr'?' selected':'')+'>支付宝二维码</option>'
        +'<option value="alipay_account"'+(expMethod==='alipay_account'?' selected':'')+'>支付宝账号</option>'
        +'<option value="bank"'+(expMethod==='bank'?' selected':'')+'>对公账号</option>'
        +'</select></div>'
        +'</div>'
        // 支付宝账号信息
        +'<div id="alipay-account-info" class="form-grid" style="'+alipayInfoDisplay+'">'
        +'<div class="form-group"><label>支付宝账号</label><input type="text" name="alipayAccount" value="'+(paymentDetail.alipayAccount||'')+'" placeholder="账号"/></div>'
        +'<div class="form-group"><label>支付宝姓名</label><input type="text" name="alipayName" value="'+(paymentDetail.alipayName||'')+'" placeholder="姓名"/></div>'
        +'</div>'
        // 对公账号信息
        +'<div id="bank-info" class="form-grid" style="'+bankInfoDisplay+'">'
        +'<div class="form-group"><label>开户行</label><input type="text" name="bankName" value="'+(paymentDetail.bankName||'')+'" placeholder="如：工商银行深圳分行"/></div>'
        +'<div class="form-group"><label>对公账号</label><input type="text" name="bankAccount" value="'+(paymentDetail.bankAccount||'')+'" placeholder="账号"/></div>'
        +'<div class="form-group"><label>账户名称</label><input type="text" name="bankHolder" value="'+(paymentDetail.bankHolder||'')+'" placeholder="账户名称"/></div>'
        +'</div>'
        // 二维码上传
        +'<div id="exp-img-upload" style="'+imgUploadDisplay+'">'
        +'<div class="form-group"><label>上传凭证</label>'
        +'<input type="file" id="exp-img-input" accept="image/*" multiple onchange="previewExpImg(this)"/>'
        +'<div id="exp-img-preview"'+(expImg?'':' style="display:none"')+'>'+(expImg?renderImgThumbs(expImg,'width:80px;height:80px;object-fit:cover;border-radius:4px;margin:3px;border:1px solid #e2e8f0;cursor:pointer;','',true,expCreateGid):'')+'</div>'
        +'</div></div>'
        +'<div class="form-group full"><label>备注</label><input name="remark" value="'+esc(it.rk||'')+'" placeholder="请输入备注"/></div>'
        +'</form>';
      showModal('支出申请',body,function(){
        // 保存时重新从 DB_ORDERS 获取最新引用，确保数据写入正确位置
        var curO=DB_ORDERS.find(function(x){return x.id===oid;});
        if(!curO||!curO.items||!curO.items[idx]){toast('数据异常，请重试','error');return;}
        var curIt=curO.items[idx];
        var f=getFormData('exp-item-form');
        if(!f.expAmount||f.expAmount<=0){toast('请输入支出金额','error');return}
        if(!f.expMethod){toast('请选择支付方式','error');return}
        // 创建新的支出记录
        var expRecord={
          expNo:genExpNo(curO, curIt),
          xd:f.expDate,  // 申请时间
          xp:f.expMethod, // 支付方式
          xm:parseFloat(f.expAmount)||0, // 申请金额
          payee:f.payee||'', // 支出对象
          xb:'', // 支付详情
          xi:'', // 截图
          rk:f.remark||'' // 备注
        };
        // 保存支付详情
        var pDetail={method:f.expMethod};
        if(f.expMethod==='alipay_account'){
          pDetail.alipayAccount=f.alipayAccount;
          pDetail.alipayName=f.alipayName;
        }else if(f.expMethod==='bank'){
          pDetail.bankName=f.bankName;
          pDetail.bankAccount=f.bankAccount;
          pDetail.bankHolder=f.bankHolder;
        }
        expRecord.xb=JSON.stringify(pDetail);
        // 初始化xr数组（如果是第一条记录）
        if(!curIt.xr)curIt.xr=[];
        curIt.xr.push(expRecord);
        // 同时更新子订单的直接字段（兼容表格显示）
        curIt.xd=f.expDate;  // 申请时间
        curIt.xp=f.expMethod; // 支付方式
        curIt.xm=parseFloat(f.expAmount)||0; // 申请金额
        curIt.rk=f.remark||'';
        // 重新计算收益（使用最新一条记录的金额）
        var pm=curIt.pm||0;
        var cost=curIt.cost||0;
        var lastExp=curIt.xr[curIt.xr.length-1];
        curIt.profit=pm-(lastExp.xm||0)-cost;
        // 保存图片（多图上传）
        var pendingExps=_pendingImgFiles['exp-img-input']||[];
        var doSaveExp2=function(xiVal){
          curIt.xi=xiVal;
          if(curIt.xr&&curIt.xr.length)curIt.xr[curIt.xr.length-1].xi=xiVal;
          if(curIt.itemStatus==='draft'||!curIt.itemStatus) curIt.itemStatus='pending';
          sumOrder(curO);
          syncAll();
          updateApprovalBadge();
          toast('支出申请已保存');
          closeModal();
          renderOrdersTable();
        };
        if(pendingExps.length){
          uploadMultipleImages(pendingExps).then(function(urls){
            delete _pendingImgFiles['exp-img-input'];
            var existingUrls=parseImgUrls(window._editImgData[expCreateGid]||"");
            var mergedUrls=existingUrls.concat(urls);
            doSaveExp2(makeImgUrls(mergedUrls));
          }).catch(function(e){
            console.error('图片上传失败:',e);
            doSaveExp2(window._editImgData?window._editImgData[expCreateGid]||'':'');
          });
        }else{
          doSaveExp2(window._editImgData?window._editImgData[expCreateGid]||'':'');
        }
      });
      break;
    }
  }
}

// 模态框键盘支持：Enter=确认，Escape=取消
function setupModalKeyboard(){
  if(window._modalKeyHandler) document.removeEventListener('keydown', window._modalKeyHandler);
  window._modalKeyHandler = function(e){
    var overlay = $('modal-overlay');
    if(!overlay || !overlay.classList.contains('active')) return;
    if(e.key === 'Escape'){ e.preventDefault(); closeModal(); return; }
    if(e.key === 'Enter'){
      var tag = document.activeElement && document.activeElement.tagName;
      if(tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      var btn = document.getElementById('modal-confirm');
      if(btn && window._currentModalOnOk) btn.click();
    }
  };
  document.addEventListener('keydown', window._modalKeyHandler);
}
function showModal(title,bodyHTML,onOk,wide){
  // 打开新弹窗时，清除待处理的重开回调
  window._modalReopenCallback=null;
  // 保存当前模态框状态到栈中（支持嵌套弹窗：取消时返回上一级）
  // 注意：同时保存 onOk 回调（即上一个弹窗的确认按钮事件），恢复时重新绑定
  // 保存表单字段值（innerHTML不序列化input.value/select.selected等DOM property）
  var formValues=null;
  var bodyEl=$('modal-body');
  if(bodyEl){
    var inputs=bodyEl.querySelectorAll('input[name],select[name],textarea[name]');
    if(inputs.length>0){
      formValues={};
      for(var fi=0;fi<inputs.length;fi++){
        var inp=inputs[fi];
        if(inp.type==='checkbox'||inp.type==='radio'){
          // checkbox/radio只保存checked状态和disabled状态
          var key=inp.name+'__chk__'+fi;
          formValues[key]={checked:inp.checked,disabled:inp.disabled};
        }else{
          formValues[inp.name]={'value':inp.value,'disabled':inp.disabled,'type':inp.type};
          // select需要保存selectedIndex
          if(inp.tagName==='SELECT'){
            formValues[inp.name].selectedIndex=inp.selectedIndex;
          }
        }
      }
    }
  }
  var prevOnOk=window._currentModalOnOk||null;
  var savedState={
    title:$('modal-title').textContent,
    body:$('modal-body').innerHTML,
    overlayActive:$('modal-overlay').classList.contains('active'),
    onOk:prevOnOk,
    formValues:formValues,
    payModalContext:window._currentPayModalContext || null
  };
  if(savedState.overlayActive){
    if(!window._modalStack)window._modalStack=[];
    window._modalStack.push(savedState);
  }
  window._currentModalOnOk=onOk;
  $('modal-title').textContent=title;$('modal-body').innerHTML=bodyHTML;$('modal-overlay').classList.add('active');
  var okBtn=document.getElementById('modal-confirm');
  if(okBtn){
    var newBtn=okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newBtn,okBtn);
    newBtn.style.display='';
    if(onOk){newBtn.addEventListener('click',onOk);}
    else{newBtn.onclick=closeModal;}
  }
  setupModalKeyboard();
  // 所有弹窗默认支持手动拖拽缩放
  var box=$('modal-overlay').querySelector('.modal-box');
  if(box){box.classList.add('modal-box-resizable');if(wide)box.classList.add('modal-box-wide');}
}
function closeModal(){
  // 如果栈中有上一级弹窗状态，恢复它（而不是直接关闭）
  if(window._modalStack&&window._modalStack.length>0){
    var prev=window._modalStack.pop();

    // 先恢复 _currentPayModalContext（从保存的状态中恢复）
    if(prev.payModalContext){
      window._currentPayModalContext=prev.payModalContext;
    }

    // 关键：在恢复 body 之前，用最新数据更新 prev.body 中的待审批记录区域
    var ctx=window._currentPayModalContext;
    if(ctx&&ctx.oid){
      // 用临时 div 操作 HTML 字符串，避免直接操作 DOM
      var tmp=document.createElement('div');
      tmp.innerHTML=prev.body;
      var sec=tmp.querySelector('#pending-pay-records-section');
      if(sec){
        sec.outerHTML=buildPendingPaySection(ctx.oid,ctx.subIndices);
        prev.body=tmp.innerHTML;
      }
      var rsec=tmp.querySelector('#rejected-pay-records-section');
      if(rsec){
        rsec.outerHTML=buildRejectedPaySection(ctx.oid,ctx.subIndices);
        prev.body=tmp.innerHTML;
      }
    }

    $('modal-title').textContent=prev.title;
    $('modal-body').innerHTML=prev.body;
    $('modal-overlay').classList.add('active');
    // 恢复确认按钮的事件监听器
    window._currentModalOnOk=prev.onOk;
    // 强制重新绑定确认按钮：移除旧按钮，创建新按钮，绑定事件
    var confirmBtn=$('modal-confirm');
    if(confirmBtn){
      var newConfirmBtn=confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn,confirmBtn);
      newConfirmBtn.style.display='';
      if(prev.onOk){newConfirmBtn.addEventListener('click',prev.onOk);}
      else{newConfirmBtn.onclick=closeModal;}
    }
    // 恢复表单字段值（value/selected/disabled/checked）
    if(prev.formValues){
      var bodyEl=$('modal-body');
      var inputs=bodyEl.querySelectorAll('input[name],select[name],textarea[name]');
      for(var fi=0;fi<inputs.length;fi++){
        var inp=inputs[fi];
        if(inp.type==='checkbox'||inp.type==='radio'){
          var chkKey=inp.name+'__chk__'+fi;
          if(prev.formValues[chkKey]){
            inp.checked=prev.formValues[chkKey].checked;
            inp.disabled=prev.formValues[chkKey].disabled;
          }
        }else if(prev.formValues[inp.name]){
          inp.value=prev.formValues[inp.name].value;
          inp.disabled=prev.formValues[inp.name].disabled;
          if(inp.tagName==='SELECT'&&typeof prev.formValues[inp.name].selectedIndex==='number'){
            inp.selectedIndex=prev.formValues[inp.name].selectedIndex;
          }
        }
      }
    }
    // 恢复定位状态
    var box=$('modal-overlay').querySelector('.modal-box');
    if(box){box.style.position='relative';box.style.margin='auto';box.style.left='';box.style.top='';box.style.zIndex='';}
    // 恢复选择弹窗时，重置所有复选框为未选中
    var restoredChks=$('modal-body').querySelectorAll('input[type="checkbox"]');
    for(var rci=0;rci<restoredChks.length;rci++){restoredChks[rci].checked=false;}
    // 如果恢复的是 wide 弹窗，加上 resizable 类
    // 所有恢复的弹窗默认支持手动缩放
    var revivedBox=$('modal-overlay').querySelector('.modal-box');
    if(revivedBox){
      revivedBox.classList.add('modal-box-resizable');
      var rBody=$('modal-body').innerHTML||'';
      if(rBody.indexOf('pay-app-records-table')!==-1||rBody.indexOf('exp-app-records-table')!==-1){
        revivedBox.classList.add('modal-box-wide');
      }
    }
    // 重新应用保存的列宽
    initResizableTable('exp-select-table');
    initResizableTable('pay-select-table');
    initResizableTable('exp-batch-table');
    initResizableTable('exp-app-records-table');
    initResizableTable('pay-app-records-table');
  }else{
    $('modal-overlay').classList.remove('active');
    window._currentModalOnOk=null;
  }
  // 如果有关闭回调和重开回调（仅 closeModal 触发，closeAllModals 不触发）
  if(window._modalCloseCallback) window._modalCloseCallback();
  if(window._modalReopenCallback){
    var cb=window._modalReopenCallback;
    window._modalReopenCallback=null;
    setTimeout(cb, 50);
  }
}
function closeAllModals(){
  // 清空栈并关闭模态框（用于保存完成等需要彻底关闭的场景）
  window._modalReopenCallback=null; // 保存时不重开
  if(window._modalStack)window._modalStack=[];
  window._currentModalOnOk=null;
  $('modal-overlay').classList.remove('active');
  // 重置模态框定位
  var box=$('modal-overlay').querySelector('.modal-box');
  if(box){box.style.position='relative';box.style.margin='auto';box.style.left='';box.style.top='';box.style.zIndex='';}
  // 如果有重开回调，调用并清除
  if(window._modalReopenCallback){
    var cb=window._modalReopenCallback;
    window._modalReopenCallback=null;
    setTimeout(cb, 50);
  }
}
// 就地刷新当前弹窗中的收款申请记录表格（不重开弹窗）
function refreshPayAppTable(oid){
  renderOrdersTable();renderDashboard();
  var table=$('pay-app-records-table');
  if(!table)return;
  var tbody=table.querySelector('tbody');
  if(!tbody)return;
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){tbody.innerHTML='<tr><td colspan="10" style="padding:16px;text-align:center;color:#9ca3af">订单不存在</td></tr>';return;}
  sumOrder(o); // 重新计算汇总
  // 重新收集数据并构建行
  var allRecs=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(it.pr_records){
        for(var ri=0;ri<it.pr_records.length;ri++){
          var rec=it.pr_records[ri];
          var st='submitted',stt='已提交',stc='tag-orange';
          if(rec.pf){st='approved';stt='审批通过';stc='tag-green';}
          else if(rec.prej){st='rejected';stt='已驳回';stc='tag-red';}
          allRecs.push({subIdx:i,recIdx:ri,rec:rec,it:it,status:st,statusText:stt,statusCls:stc});
        }
      }
    }
  }
  // 按batchId分组
  var groups={},order=[];
  for(var gi=0;gi<allRecs.length;gi++){
    var pr=allRecs[gi];
    var bid=pr.rec.batchId||('__no_'+pr.subIdx+'_'+pr.recIdx);
    if(!groups[bid]){groups[bid]=[];order.push(bid);}
    groups[bid].push(pr);
  }
  var cm=curRole==='admin'||curRole==='finance'||curRole==='gm';
  var rows='';
  for(var gk=0;gk<order.length;gk++){
    var grp=groups[order[gk]];
    var ta=0;for(var ti=0;ti<grp.length;ti++)ta+=(grp[ti].rec.pm||0);
    var ap=grp.some(function(g){return g.status==='submitted';});
    var ar=grp.some(function(g){return g.status==='rejected';});
    var aa=grp.some(function(g){return g.status==='approved';});
    var stt2=ap?'已提交':ar?'已驳回':'审批通过';
    var stc2=ap?'tag-orange':ar?'tag-red':'tag-green';
    var sb='',cn='',ad='';
    for(var si=0;si<grp.length;si++){
      var p=grp[si];
      sb+=(si>0?'<br>':'')+esc(p.it.subBn||('子'+p.subIdx));
      cn+=(si>0?'<br>':'')+esc(p.it.co||'-');
      ad+=(si>0?'<br>':'')+esc(p.it.addr||'-');
    }
    var ce=cm||(!aa);
    rows+='<tr style="border-bottom:1px solid #fde68a">';
    rows+='<td style="padding:6px 8px;font-size:11px;color:#6b7280">'+(grp[0].rec.pd||'-')+'</td>';
    rows+='<td style="padding:6px 8px;font-size:11px;color:#1d4ed8">'+(grp[0].rec.payNo||'-')+'</td>';
    rows+='<td style="padding:6px 8px">'+sb+'</td>';
    rows+='<td style="padding:6px 8px">'+cn+'</td>';
    rows+='<td style="padding:6px 8px">'+ad+'</td>';
    rows+='<td style="padding:6px 8px;text-align:right;font-weight:600;color:#f59e0b">¥'+ta.toFixed(2)+'</td>';
    // 截图列
    var img='';
    for(var si2=0;si2<grp.length&&!img;si2++){if(grp[si2].rec.pxi&&grp[si2].rec.pxi.trim()!=='')img=grp[si2].rec.pxi;}
    rows+='<td style="padding:6px 8px;text-align:center">';
    if(img)rows+=renderImgThumbs(img,'width:30px;height:30px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;');
    else rows+='<span style="color:#ccc;font-size:10px">-</span>';
    rows+='</td>';
    // 备注
    var rm='';
    for(var si3=0;si3<grp.length&&!rm;si3++){if(grp[si3].rec.px)rm=esc(grp[si3].rec.px);if(!rm&&grp[si3].rec.prej)rm='驳回：'+esc(grp[si3].rec.prej);}
    rows+='<td style="padding:6px 8px;font-size:11px;color:#6b7280;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+rm+'">'+(rm||'-')+'</td>';
    rows+='<td style="padding:6px 8px;text-align:center"><span class="'+stc2+'" style="font-size:11px">'+stt2+'</span></td>';
    rows+='<td style="padding:6px 8px;text-align:center">';
    if(ce)rows+='<button type="button" style="padding:2px 6px;font-size:11px;background:#3b82f6;color:#fff;border-radius:4px;margin-right:2px" onclick="editPayBatch(\''+order[gk]+'\','+oid+')">修改</button><button type="button" style="padding:2px 6px;font-size:11px;background:#ef4444;color:#fff;border-radius:4px" onclick="deletePayRecordByBatch(\''+order[gk]+'\','+oid+')">删除</button>';
    else rows+='<span style="color:#999;font-size:11px">-</span>';
    rows+='</td></tr>';
  }
  if(tbody)tbody.innerHTML=rows||'<tr><td colspan="10" style="padding:16px;text-align:center;color:#9ca3af">暂无申请记录</td></tr>';
  // 更新计数徽章
  var badge=table.closest('[class]').querySelector('[style*="background:#f59e0b"]');
  if(badge)badge.textContent=order.length;
}
function refreshExpAppTable(oid){
  renderOrdersTable();renderDashboard();
  var table=$('exp-app-records-table');
  if(!table)return;
  var tbody=table.querySelector('tbody');
  if(!tbody)return;
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){tbody.innerHTML='<tr><td colspan="10" style="padding:16px;text-align:center;color:#9ca3af">订单不存在</td></tr>';return;}
  sumOrder(o); // 重新计算汇总
  var allRecs=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(it.xr){
        for(var ri=0;ri<it.xr.length;ri++){
          var rec=it.xr[ri];
          var st='submitted',stt='已提交',stc='tag-orange';
          if(rec.xf){st='approved';stt='审批通过';stc='tag-green';}
          else if(rec.xrej){st='rejected';stt='已驳回';stc='tag-red';}
          allRecs.push({subIdx:i,recIdx:ri,rec:rec,it:it,status:st,statusText:stt,statusCls:stc});
        }
      }
    }
  }
  var groups={},order=[];
  for(var gi=0;gi<allRecs.length;gi++){
    var pr=allRecs[gi];
    var bid=pr.rec.batchId||('__no_'+pr.subIdx+'_'+pr.recIdx);
    if(!groups[bid]){groups[bid]=[];order.push(bid);}
    groups[bid].push(pr);
  }
  var cm=curRole==='admin'||curRole==='finance'||curRole==='gm';
  var rows='';
  for(var gk=0;gk<order.length;gk++){
    var grp=groups[order[gk]];
    var ta=0;for(var ti=0;ti<grp.length;ti++)ta+=(grp[ti].rec.xm||0);
    var ap=grp.some(function(g){return g.status==='submitted';});
    var ar=grp.some(function(g){return g.status==='rejected';});
    var aa=grp.some(function(g){return g.status==='approved';});
    var stt2=ap?'已提交':ar?'已驳回':'审批通过';
    var stc2=ap?'tag-orange':ar?'tag-red':'tag-green';
    var sb='',cn='',ad='';
    for(var si=0;si<grp.length;si++){
      var p=grp[si];
      sb+=(si>0?'<br>':'')+esc(p.it.subBn||('子'+p.subIdx));
      cn+=(si>0?'<br>':'')+esc(p.it.co||'-');
      ad+=(si>0?'<br>':'')+esc(p.it.addr||'-');
    }
    var ce=cm||(!aa);
    rows+='<tr style="border-bottom:1px solid #fde68a">';
    rows+='<td style="padding:6px 8px;font-size:11px;color:#6b7280">'+(grp[0].rec.xd||'-')+'</td>';
    rows+='<td style="padding:6px 8px;font-size:11px;color:#1d4ed8">'+(grp[0].rec.expNo||'-')+'</td>';
    rows+='<td style="padding:6px 8px">'+sb+'</td>';
    rows+='<td style="padding:6px 8px">'+cn+'</td>';
    rows+='<td style="padding:6px 8px">'+ad+'</td>';
    rows+='<td style="padding:6px 8px;text-align:right;font-weight:600;color:#d97706">¥'+ta.toFixed(2)+'</td>';
    var img='';
    for(var si2=0;si2<grp.length&&!img;si2++){if(grp[si2].rec.xi&&grp[si2].rec.xi.trim()!=='')img=grp[si2].rec.xi;}
    rows+='<td style="padding:6px 8px;text-align:center">';
    if(img)rows+=renderImgThumbs(img,'width:30px;height:30px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;');
    else rows+='<span style="color:#ccc;font-size:10px">-</span>';
    rows+='</td>';
    var rm='';
    for(var si3=0;si3<grp.length&&!rm;si3++){if(grp[si3].rec.rk)rm=esc(grp[si3].rec.rk);if(!rm&&grp[si3].rec.xrej)rm='驳回：'+esc(grp[si3].rec.xrej);}
    rows+='<td style="padding:6px 8px;font-size:11px;color:#6b7280;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+rm+'">'+(rm||'-')+'</td>';
    rows+='<td style="padding:6px 8px;text-align:center"><span class="'+stc2+'" style="font-size:11px">'+stt2+'</span></td>';
    rows+='<td style="padding:6px 8px;text-align:center">';
    if(ce)rows+='<button type="button" style="padding:2px 6px;font-size:11px;background:#3b82f6;color:#fff;border-radius:4px;margin-right:2px" onclick="editExpBatch(\''+order[gk]+'\','+oid+')">修改</button><button type="button" style="padding:2px 6px;font-size:11px;background:#ef4444;color:#fff;border-radius:4px" onclick="deleteExpRecordByBatch(\''+order[gk]+'\','+oid+')">删除</button>';
    else rows+='<span style="color:#999;font-size:11px">-</span>';
    rows+='</td></tr>';
  }
  if(tbody)tbody.innerHTML=rows||'<tr><td colspan="10" style="padding:16px;text-align:center;color:#9ca3af">暂无申请记录</td></tr>';
  var badge=table.closest('[class]').querySelector('[style*="background:#f59e0b"]');
  if(badge)badge.textContent=order.length;
}
// 设置弹窗刷新回调（编辑/删除申请记录后就地刷新表格）
function refreshPayModalOnClose(oid){
  window._modalReopenCallback=function(){refreshPayAppTable(oid);};
}
function refreshExpModalOnClose(oid){
  window._modalReopenCallback=function(){refreshExpAppTable(oid);};
}
// ========== 弹窗拖动功能 ==========
(function(){
  var dragState=null;
  document.addEventListener('mousedown',function(e){
    // 只处理 .modal-header 内的拖动（不干扰按钮等操作）
    var header=e.target.closest('.modal-header');
    if(!header)return;
    if(e.target.closest('button'))return; // 不拦截按钮点击
    var box=header.closest('.modal-box');
    if(!box)return;
    var rect=box.getBoundingClientRect();
    dragState={box:box,startX:e.clientX,startY:e.clientY,origLeft:rect.left,origTop:rect.top};
    // 切换为绝对定位
    box.style.position='fixed';
    box.style.margin='0';
    box.style.left=rect.left+'px';
    box.style.top=rect.top+'px';
    box.style.zIndex='1001';
    e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!dragState)return;
    var dx=e.clientX-dragState.startX;
    var dy=e.clientY-dragState.startY;
    // 限制不超出屏幕
    var newLeft=Math.max(0,Math.min(window.innerWidth-dragState.box.offsetWidth,dragState.origLeft+dx));
    var newTop=Math.max(0,Math.min(window.innerHeight-40,dragState.origTop+dy));
    dragState.box.style.left=newLeft+'px';
    dragState.box.style.top=newTop+'px';
  });
  document.addEventListener('mouseup',function(){
    dragState=null;
  });
})();
function getFormData(fid){var f=$(fid),obj={};f.querySelectorAll('[name]').forEach(function(el){var v=el.value.trim();if(el.type==='number')v=v?Number(v):0;obj[el.name]=v});return obj}
function buildPg(container,totalPages,curPage,callback){
  if(!container)return;
  var html='<span class="page-info">\u5171 '+totalPages+' \u9875</span>';
  for(var i=1;i<=totalPages;i++){html+='<button class="page-btn'+(i===curPage?' active':'')+'" data-pg="'+i+'">'+i+'</button>'}
  container.innerHTML=html;
  var btns=container.querySelectorAll('.page-btn');for(var i=0;i<btns.length;i++){btns[i].addEventListener('click',function(){callback(+this.dataset.pg)})}
}

// \u6bcf\u9875\u663e\u793a\u6570\u91cf\u5207\u6362
function setPageSize(size){
  PS=parseInt(size)||15;
  ap=1;og=1;cp=1;ip=1;ep=1;userPage=1;
  var sels=document.querySelectorAll('.page-size-select');
  for(var i=0;i<sels.length;i++)sels[i].value=String(PS);
  refreshCurrentPage();
}

// ========== 账号管理 ==========
// 角色切换时更新权限勾选
function updatePermsByRole(role, isEdit){
  if(!window.defaultPermsByRole)return;
  if(isEdit)return; // 编辑时不覆盖已有权限
  var defaultPerms=window.defaultPermsByRole[role]||[];
  var boxes=document.querySelectorAll('#uf input[name="perms"]');
  for(var i=0;i<boxes.length;i++){
    boxes[i].checked=defaultPerms.indexOf(boxes[i].value)!==-1;
  }
}
function renderUserTable(){
  var kw=$('user-search')?$('user-search').value.toLowerCase():'';
  var data=DB_USERS.filter(function(u){
    return (!kw)||(u.username+''+u.name+''+(RN[u.role]||'')).toLowerCase().indexOf(kw)>-1;
  });
  data=applyTableFilter(data,_userFilters,_userSort,_userCtx);
  updateHeaderIndicators($('users-tbody').parentNode,_userFilters,_userSort);
  // 更新统计
  $('user-total').textContent=DB_USERS.length;
  $('user-active').textContent=DB_USERS.filter(function(u){return u.role==='admin'}).length;
  $('user-sales').textContent=DB_USERS.filter(function(u){return u.role==='sales'}).length;
  // 分页
  var pageSize=PS,totalPages=Math.max(1,Math.ceil(data.length/pageSize));
  if(userPage>totalPages)userPage=totalPages;
  var start=(userPage-1)*pageSize,end=Math.min(start+pageSize,data.length);
  var html='';
  if(data.length===0){
    html='<tr><td colspan="11" style="text-align:center;padding:40px;color:#999">\u6682\u65e0\u8d26\u53f7\u6570\u636e</td></tr>';
  } else {
    for(var i=start;i<end;i++){
      var u=data[i];
      var roleCls={admin:'tag-red',sales:'tag-blue',neiqin:'tag-green',finance:'tag-purple'};
      var roleTag='<span class="'+(roleCls[u.role]||'tag-gray')+'">'+(RN[u.role]||u.role)+'</span>';
      var lastLogin=u.lastLogin||'-';
      // 格式化账号显示
      var formatAccounts=function(accStr,tagClass){
        if(!accStr)return '<span style="color:#999">-</span>';
        return '<div style="display:flex;flex-wrap:wrap;gap:4px">'+accStr.split(',').map(function(a){return '<span class="'+tagClass+'" style="font-size:11px;padding:2px 6px">'+a.trim()+'</span>'}).join('')+'</div>';
      };
      html+='<tr>'
        +'<td style="text-align:center;color:#888;font-size:12px">'+(i-start+1)+'</td>'
        +'<td><strong>'+u.username+'</strong></td>'
        +'<td>'+u.name+'</td>'
        +'<td>'+formatAccounts(u.account,'tag-blue')+'</td>'
        +'<td>'+formatAccounts(u.payAccount,'tag-green')+'</td>'
        +'<td>'+formatAccounts(u.expAccount,'tag-orange')+'</td>'
        +'<td>'+roleTag+'</td>'
        +'<td><div class="avatar-circle" style="display:inline-flex;width:28px;height:28px;border-radius:50%;background:#667eea;color:#fff;font-size:12px;align-items:center;justify-content:center">'+u.avatar+'</div></td>'
        +'<td>'+(u.createdAt||'-')+'</td>'
        +'<td>'+lastLogin+'</td>'
        +'<td><button class="btn-edit" onclick="openUserModal(\''+u.username+'\')">编辑</button> '
        +(u.username!==curUser.username?'<button class="btn-delete" onclick="delUser(\''+u.username+'\')">删除</button>':'<span style="color:#ccc">-</span>')
        +'</td></tr>';
    }
  }
  $('users-tbody').innerHTML=html;
  buildPg($('users-pagination'),totalPages,userPage,function(p){userPage=p;renderUserTable()});
}
function openUserModal(username){
  var isEdit=!!username;
  var user=username?DB_USERS.find(function(u){return u.username===username}):null;
  var roles=['admin','sales','neiqin','finance','accountant'];
  var roleOptions='';
  for(var i=0;i<roles.length;i++){
    roleOptions+='<option value="'+roles[i]+'"'+(user&&user.role===roles[i]?' selected':'')+'>'+(RN[roles[i]]||roles[i])+'</option>';
  }
  // 角色默认权限预设（挂到window供updatePermsByRole使用）
  var defaultPermsByRole=window.defaultPermsByRole={
    admin:['address','orders','customers','renew','approval','performance','income','expenses','users','invoice'],
    sales:['contract','address','orders','customers','renew','performance','invoice'],
    neiqin:['contract','address','orders','renew','approval','invoice'],
    finance:['contract','approval','income','expenses','performance','invoice'],
    accountant:['orders','invoice']
  };
  // 权限列表（key需与导航data-page一致）
  var permList=[
    {key:'contract',label:'出合同'},
    {key:'address',label:'地址管理'},
    {key:'orders',label:'订单管理'},
    {key:'customers',label:'客户管理'},
    {key:'renew',label:'续费提醒'},
    {key:'approval',label:'审批中心'},
    {key:'performance',label:'业绩管理'},
    {key:'income',label:'公司总收入'},
    {key:'expenses',label:'财务支出'},
    {key:'users',label:'账号管理'},
    {key:'invoice',label:'开票申请'}
  ];
  var userPerms=user&&user.permissions?user.permissions:(defaultPermsByRole[user?user.role:'sales']||[]);
  var permHtml='<div id="perm-checkboxes" style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 0">';
  for(var pi=0;pi<permList.length;pi++){
    var p=permList[pi];
    var checked=userPerms.indexOf(p.key)!==-1?' checked':'';
    permHtml+='<label style="display:flex;align-items:center;gap:4px;cursor:pointer;background:#f3f4f6;padding:4px 10px;border-radius:4px;font-size:13px"><input type="checkbox" name="perms" value="'+p.key+'"'+checked+'/> '+p.label+'</label>';
  }
  permHtml+='</div>';
  var body='<form id="uf"><div class="form-grid">'
    +'<div class="form-group"><label>用户名 <span style="color:red">*</span></label><input name="username" value="'+esc(user?user.username:'')+'" '+(isEdit?'readonly':'')+' placeholder="请输入用户名"/></div>'
    +'<div class="form-group"><label>姓名</label><input name="name" value="'+esc(user?user.name:'')+'" placeholder="请输入姓名"/></div>'
    +'<div class="form-group full"><label>对接账号</label><input name="account" value="'+esc(user?user.account:'')+'" placeholder="多个账号用逗号分隔，如:GEW,GEW01"/></div>'
    +'<div class="form-group full"><label>收款账号</label><input name="payAccount" value="'+esc(user?user.payAccount:'')+'" placeholder="多个账号用逗号分隔"/></div>'
    +'<div class="form-group full"><label>支出账号</label><input name="expAccount" value="'+esc(user?user.expAccount:'')+'" placeholder="多个账号用逗号分隔"/></div>'
    +'<div class="form-group"><label>密码'+(isEdit?'':' <span style="color:red">*</span>')+'</label><input name="password" type="text" value="'+(isEdit?'':esc(user?user.password:''))+'" placeholder="'+(isEdit?'不修改请留空，留空则保留原密码':'请输入密码')+'"/></div>'
    +'<div class="form-group"><label>角色</label><select name="role" id="uf-role" onchange="updatePermsByRole(this.value, '+(isEdit?'true':'false')+')">'+roleOptions+'</select></div>'
    +'<div class="form-group"><label>头像文字</label><input name="avatar" value="'+esc(user?user.avatar:'')+'" placeholder="如:管理员输入 A"/></div>'
    +'<div class="form-group full"><label>功能权限</label>'+permHtml+'</div>'
    +'</div></form>';
  showModal(isEdit?'编辑账号':'新增账号',body,function(){
    var f=getFormData('uf');
    if(!f.username){toast('请输入用户名','error');return}
    if(!isEdit&&!f.password){toast('请输入密码','error');return}
    if(!f.name)f.name=f.username;
    if(!f.avatar)f.avatar=f.name.charAt(0);
    // 收集选中的权限
    var checkedPerms=[];
    var permCheckboxes=document.querySelectorAll('#uf input[name="perms"]:checked');
    for(var ci=0;ci<permCheckboxes.length;ci++){
      checkedPerms.push(permCheckboxes[ci].value);
    }
    if(isEdit){
      // 编辑时如果密码留空，保留原密码
      if(!f.password)delete f.password;
      for(var i=0;i<DB_USERS.length;i++){
        if(DB_USERS[i].username===username){
          DB_USERS[i]=Object.assign(DB_USERS[i],f);
          DB_USERS[i].permissions=checkedPerms;
          break;
        }
      }
    } else {
      if(DB_USERS.find(function(u){return u.username===f.username})){
        toast('用户名已存在','error');return;
      }
      f.createdAt=todayStr();
      f.lastLogin=null;
      f.permissions=checkedPerms;
      DB_USERS.push(f);
    }
    syncAll();
    toast(isEdit?'已更新':'已添加');
    closeAllModals();
    renderUserTable();
  });
}
function delUser(username){
  if(username===curUser.u){toast('不能删除当前登录账号','error');return}
  confirmDialog('确认删除账号 "'+username+'" ？',function(){
    DB_USERS=DB_USERS.filter(function(u){return u.username!==username});
    syncAll();
    toast('已删除');
    renderUserTable();
  });
}

// 切换支付方式时显示/隐藏相关字段
function toggleBankInfo(method){
  var alipayInfo=document.getElementById('alipay-account-info');
  var bankInfo=document.getElementById('bank-info');
  var imgUpload=document.getElementById('exp-img-upload');
  if(alipayInfo)alipayInfo.style.display=method==='alipay_account'?'':'none';
  if(bankInfo)bankInfo.style.display=method==='bank'?'':'none';
  if(imgUpload)imgUpload.style.display=(method==='wechat'||method==='alipay_qr')?'':'none';
}

// 预览上传的凭证图片（支持申请支出和确认支出替换两种场景）
function previewExpImg(input){
  if(input.files&&input.files.length>0){
    var key=input.id||'exp-img-input';
    var files=Array.prototype.slice.call(input.files);
    // 追加到现有待上传文件列表
    var existing=_pendingImgFiles[key]||[];
    _pendingImgFiles[key]=existing.concat(files);
    if(key==='exp-replace-img'||key==='approve-batch-exp-img'){
      // 替换模式：清空旧的只显示新选文件
      var preview=document.getElementById('exp-img-preview-replace');
      if(preview){preview.style.display='';preview.innerHTML='';}
      for(var i=0;i<files.length;i++){
        (function(file, fi){
          var r=new FileReader();
          r.onload=function(e){
            var wrap=buildPendingImgWrap(e.target.result,key,file);
            if(preview)preview.appendChild(wrap);
          };
          r.readAsDataURL(file);
        })(files[i]);
      }
    }else{
      // 追加模式：不清除已有缩略图，仅追加新选文件的预览（含红色X删除按钮）
      var previewIds=['exp-img-preview','edit-exp-img-preview','edit-exp-batch-img-preview'];
      for(var pi=0;pi<previewIds.length;pi++){
        var preview=document.getElementById(previewIds[pi]);
        if(preview)preview.style.display='';
      }
      for(var i=0;i<files.length;i++){
        (function(file){
          var r=new FileReader();
          r.onload=function(e){
            var dataUrl=e.target.result;
            for(var pj=0;pj<previewIds.length;pj++){
              var pv=document.getElementById(previewIds[pj]);
              if(pv)pv.appendChild(buildPendingImgWrap(dataUrl,key,file));
            }
          };
          r.readAsDataURL(file);
        })(files[i]);
      }
    }
  }
}

// 获取支付方式显示文本
function getExpMethodText(method){
  var map={wechat:'微信',alipay_qr:'支付宝',alipay_account:'支付宝账号',bank:'对公账号'};
  return map[method]||'-';
}

// 子订单列宽调整功能
(function initSubOrderColResize(){
  // 从localStorage加载列宽设置
  var defaultSubColWidths={subBn:130,bt:70,subOd:90,co:120,addr:150,sd:100,ed:100,pr:70,pd:100,pa:90,pm:70,xa:80,xm:70,cost:70,profit:60,rk:100,action:80};
  var savedWidths=localStorage.getItem('subOrderColWidths');
  if(savedWidths){
    try{
      var parsed=JSON.parse(savedWidths);
      // 合并保存的值和默认值，确保所有字段都有值
      window.subOrderColWidths={};
      for(var k in defaultSubColWidths){
        window.subOrderColWidths[k]=(parsed[k]!==undefined)?parsed[k]:defaultSubColWidths[k];
      }
    }catch(e){
      window.subOrderColWidths=Object.assign({},defaultSubColWidths);
    }
  }
  if(!window.subOrderColWidths){
    window.subOrderColWidths=Object.assign({},defaultSubColWidths);
  }
  
  // 保存列宽到localStorage
  window.saveSubOrderColWidths=function(){
    localStorage.setItem('subOrderColWidths',JSON.stringify(window.subOrderColWidths));
  };
  
  // 全局拖拽状态
  var isResizing=false,currentCol=null,startX,startWidth,colName;
  
  // 使用事件委托处理mousedown - 点击.sub-col的右边缘区域
  document.addEventListener('mousedown',function(e){
    var col=e.target.closest('.sub-col');
    if(!col)return;
    // 只在表头拖拽，数据行不允许拖拽调整大小
    if(!col.closest('.suborder-header'))return;
    
    var rect=col.getBoundingClientRect();
    var offsetX=e.clientX-rect.right;
    
    // 只有在列的右边缘10px内点击才触发拖拽（扩大触发区域）
    // offsetX为负表示在元素内部右侧，为正表示在元素外部
    if(offsetX<-10||offsetX>3)return;
    
    colName=col.dataset.col;
    if(!colName)return;
    
    isResizing=true;
    currentCol=col;
    startX=e.pageX;
    startWidth=parseInt(col.style.flexBasis)||parseInt(col.style.width)||window.subOrderColWidths[colName];
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
    e.preventDefault();
    e.stopPropagation();
  });
  
  // 全局mousemove处理
  document.addEventListener('mousemove',function(e){
    if(!isResizing||!currentCol||!colName)return;
    
    var diff=e.pageX-startX;
    var newWidth=Math.max(40,startWidth+diff);
    
    // 保存到全局设置
    window.subOrderColWidths[colName]=newWidth;
    
    // 同步更新所有相同列名的列（表头）
    var allCols=document.querySelectorAll('.sub-col[data-col="'+colName+'"]');
    allCols.forEach(function(col){
      col.style.flex='0 0 '+newWidth+'px';
    });
    
    // 同步更新所有数据行中对应列的宽度（通过 data-col 属性直接匹配）
    var allDataCols=document.querySelectorAll('.suborder-row > span[data-col="'+colName+'"]');
    allDataCols.forEach(function(span){
      span.style.flex='0 0 '+newWidth+'px';
    });
  });
  
  // 全局mouseup处理
  document.addEventListener('mouseup',function(){
    if(isResizing){
      isResizing=false;
      currentCol=null;
      colName=null;
      document.body.style.cursor='';
      document.body.style.userSelect='';
      // 保存到localStorage
      window.saveSubOrderColWidths();
    }
  });
  
  // 获取列索引
  function getColIndex(name){
    var cols=['status','subBn','co','addr','sd','ed','pr','pd','pa','pm','xm','cost','profit','rk','action'];
    return cols.indexOf(name);
  }
})();

// ========== 收款功能 ==========

// 收款方式映射（全局，多处使用）
var PAY_METHOD_MAP={scan:'扫码',bank:'对公',wechat:'微信二维码',alipay_qr:'支付宝二维码',alipay_account:'支付宝账号'};

// 收款申请弹窗
var _currentPayItem=null; // 全局保存当前操作的子订单
function openPayFromParent(oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  
  // 设置上下文（用于嵌套弹窗返回时刷新待审批记录区域）
  window._currentPayModalContext={oid:oid, subIndices:null};
  
  // 统计有未收款记录的子订单数量
  var selectableSubs=[];
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      // 所有子订单都可以被选中（不管有无待审批）
      selectableSubs.push(i);
    }
  }
  
  // === 收集所有子订单的收款申请记录并按batchId分组 ===
  var payAllRecords=[];
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(it.pr_records&&it.pr_records.length>0){
        for(var ri=0;ri<it.pr_records.length;ri++){
          var rec=it.pr_records[ri];
          var status='submitted';
          var statusText='已提交';
          var statusCls='tag-orange';
          if(rec.pf){status='approved';statusText='审批通过';statusCls='tag-green';}
          else if(rec.prej){status='rejected';statusText='已驳回';statusCls='tag-red';}
          payAllRecords.push({subIdx:i,recIdx:ri,rec:rec,it:it,status:status,statusText:statusText,statusCls:statusCls});
        }
      }
    }
  }
  // 按batchId分组
  var payGroups={}, payGroupOrder=[];
  for(var gi=0;gi<payAllRecords.length;gi++){
    var pr=payAllRecords[gi];
    var bid=pr.rec.batchId||('__noBatch_'+pr.subIdx+'_'+pr.recIdx);
    if(!payGroups[bid]){payGroups[bid]=[];payGroupOrder.push(bid);}
    payGroups[bid].push(pr);
  }
  // 构建收款申请记录区域
  var canModifyPay=curRole==='admin'||curRole==='finance'||curRole==='gm';
  var pendingHtml='';
  pendingHtml+='<div style="margin-bottom:16px;border:1px solid #fbbf24;border-radius:8px;overflow:hidden;background:#fffbeb">';
  pendingHtml+='<div style="background:#fef3c7;padding:8px 12px;font-weight:600;font-size:13px;border-bottom:1px solid #fbbf24;display:flex;align-items:center;justify-content:space-between">';
  pendingHtml+='<span>⚠️ 收款申请记录</span>';
  pendingHtml+='<span style="background:#f59e0b;color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">'+payGroupOrder.length+'</span>';
  pendingHtml+='</div>';
  if(payGroupOrder.length>0){
    pendingHtml+='<div style="max-height:350px;overflow-y:auto">';
    pendingHtml+='<table id="pay-app-records-table" style="width:100%;border-collapse:collapse;font-size:12px">';
    pendingHtml+='<thead><tr style="background:#fde68a"><th style="padding:6px 8px;text-align:left;position:relative">时间<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">编号<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">子订单编号<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">单位名称<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">地址<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:right;position:relative">总金额<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:center;position:relative">截图<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:left;position:relative">备注<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:center;position:relative">状态<span class="col-resizer"></span></th><th style="padding:6px 8px;text-align:center;position:relative">操作<span class="col-resizer"></span></th></tr></thead><tbody>';
    for(var gi2=0;gi2<payGroupOrder.length;gi2++){
      var grp=payGroups[payGroupOrder[gi2]];
      var totalGrpAmt=0;
      for(var ta=0;ta<grp.length;ta++) totalGrpAmt+=(grp[ta].rec.pm||0);
      var anyPending=grp.some(function(g){return g.status==='submitted';});
      var anyRejected=grp.some(function(g){return g.status==='rejected';});
      var anyApproved=grp.some(function(g){return g.status==='approved';});
      var groupStatusText=anyPending?'已提交':anyRejected?'已驳回':'审批通过';
      var groupStatusCls=anyPending?'tag-orange':anyRejected?'tag-red':'tag-green';
      var subBns='', coNames='', addrs='';
      for(var si=0;si<grp.length;si++){
        var pr=grp[si];
        subBns+=(si>0?'<br>':'')+esc(pr.it.subBn||('子'+pr.subIdx));
        coNames+=(si>0?'<br>':'')+esc(pr.it.co||'-');
        addrs+=(si>0?'<br>':'')+esc(pr.it.addr||'-');
      }
      var canEdit=canModifyPay||(!anyApproved);
      pendingHtml+='<tr style="border-bottom:1px solid #fde68a">';
      pendingHtml+='<td style="padding:6px 8px;font-size:11px;color:#6b7280">'+(grp[0].rec.pd||'-')+'</td>';
      pendingHtml+='<td style="padding:6px 8px;font-size:11px;color:#1d4ed8">'+(grp[0].rec.payNo||'-')+'</td>';
      pendingHtml+='<td style="padding:6px 8px">'+subBns+'</td>';
      pendingHtml+='<td style="padding:6px 8px">'+coNames+'</td>';
      pendingHtml+='<td style="padding:6px 8px">'+addrs+'</td>';
      pendingHtml+='<td style="padding:6px 8px;text-align:right;font-weight:600;color:#f59e0b">¥'+totalGrpAmt.toFixed(2)+'</td>';
      // 截图列
      var grpPayImg='';
      for(var si2=0;si2<grp.length&&!grpPayImg;si2++){
        var pe2=grp[si2];
        if(pe2.rec.pxi&&pe2.rec.pxi.trim()!=='') grpPayImg=pe2.rec.pxi;
      }
      pendingHtml+='<td style="padding:6px 8px;text-align:center">';
      if(grpPayImg){
        pendingHtml+=renderImgThumbs(grpPayImg,'width:30px;height:30px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;');
      }else{
        pendingHtml+='<span style="color:#ccc;font-size:10px">-</span>';
      }
      pendingHtml+='</td>';
      // 备注列（整组共用一条备注）
      var grpPayRemark='';
      for(var si3=0;si3<grp.length&&!grpPayRemark;si3++){
        var pe3=grp[si3];
        if(pe3.rec.px) grpPayRemark=esc(pe3.rec.px);
        if(!grpPayRemark&&pe3.rec.prej) grpPayRemark='驳回：'+esc(pe3.rec.prej);
      }
      pendingHtml+='<td style="padding:6px 8px;font-size:11px;color:#6b7280;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+grpPayRemark+'">'+(grpPayRemark||'-')+'</td>';
      pendingHtml+='<td style="padding:6px 8px;text-align:center"><span class="'+groupStatusCls+'" style="font-size:11px">'+groupStatusText+'</span></td>';
      pendingHtml+='<td style="padding:6px 8px;text-align:center">';
      if(canEdit&&(!anyApproved||canModifyPay)){
        pendingHtml+='<button type="button" style="padding:2px 6px;font-size:11px;background:#3b82f6;color:#fff;border-radius:4px;margin-right:2px" onclick="event.stopPropagation();editPayBatch(\''+payGroupOrder[gi2]+'\','+o.id+')">修改</button>';
        pendingHtml+='<button type="button" style="padding:2px 6px;font-size:11px;background:#ef4444;color:#fff;border-radius:4px" onclick="event.stopPropagation();deletePayRecordByBatch(\''+payGroupOrder[gi2]+'\','+o.id+')">删除</button>';
      }else{
        pendingHtml+='<span style="color:#999;font-size:11px">-</span>';
      }
      pendingHtml+='</td>';
      pendingHtml+='</tr>';
    }
    pendingHtml+='</tbody></table></div>';
  } else {
    pendingHtml+='<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">暂无申请记录</div>';
  }
  pendingHtml+='</div>';
  
  // 母订单选择列表
  // 计算所有子订单已收款总额，同时检查是否有待审批
  var totalPayAmt=0;
  var hasPendingPayInParent=false;
  if(o.items){for(var ti=0;ti<o.items.length;ti++){
    var sit=o.items[ti];
    var payArr=sit.pr_records||[];
    for(var pk=0;pk<payArr.length;pk++){
      if(!payArr[pk].prej&&payArr[pk].pf) totalPayAmt+=(payArr[pk].pm||0);
      if(!payArr[pk].prej&&!payArr[pk].pf&&payArr[pk].pm>0) hasPendingPayInParent=true;
    }
  }}
  totalPayAmt=Math.round(totalPayAmt*100)/100;
  var itemList='<div style="max-height:300px;overflow-y:auto;">';
  itemList+='<table id="pay-select-table" style="width:100%;border-collapse:collapse;font-size:13px">';
  itemList+='<thead><tr style="background:#f9fafb"><th style="width:50px;text-align:center;position:relative">选择<span class="col-resizer"></span></th><th style="position:relative">类型<span class="col-resizer"></span></th><th style="position:relative">编号<span class="col-resizer"></span></th><th style="position:relative">单位名称<span class="col-resizer"></span></th><th style="position:relative">地址<span class="col-resizer"></span></th><th style="text-align:right;position:relative">状态<span class="col-resizer"></span></th></tr></thead>';
  itemList+='<tbody>';
  // 母订单选项
  itemList+='<tr style="border-bottom:1px solid #f3f4f6;background:#fffbe6" id="pay-parent-row">';
  itemList+='<td style="padding:8px;text-align:center"><input type="checkbox" id="pay-parent-chk" onchange="onPayParentChkChange(this)"></td>';
  itemList+='<td style="padding:8px"><span class="tag-blue">母订单</span></td>';
  itemList+='<td style="padding:8px;font-weight:600">'+esc(o.bn||'')+'</td>';
  itemList+='<td style="padding:8px">'+esc(o.co||'-')+'</td>';
  itemList+='<td style="padding:8px">-</td>';
  itemList+='<td style="padding:8px;text-align:right">'+(hasPendingPayInParent?'<span class="tag-orange" style="font-size:10px">待审批</span>':'<span style="color:#10b981;font-weight:600">总收款：¥'+totalPayAmt.toFixed(2)+'</span>')+'</td>';
  itemList+='</tr>';
  // 子订单选项
  var selectableCount=0;
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      var statusText=it.itemStatus==='pending'?'审批中':it.itemStatus==='approved'?'已通过':it.itemStatus==='rejected'?'已驳回':'';
      var statusCls=it.itemStatus==='approved'?'tag-green':it.itemStatus==='rejected'?'tag-red':it.itemStatus==='pending'?'tag-orange':'tag-gray';
      var disabledAttr='';
      var rowBg='#fff';
      // 计算子订单实际总收款（从pr_records求和）
      var subTotalPay=0;
      var payRecs=it.pr_records||[];
      for(var pk2=0;pk2<payRecs.length;pk2++){if(!payRecs[pk2].prej)subTotalPay+=(payRecs[pk2].pm||0);}
      var statusExtra='<span style="color:#10b981;font-weight:600">¥'+subTotalPay.toFixed(2)+'</span>';
      itemList+='<tr style="border-bottom:1px solid #f3f4f6;background:'+rowBg+'" id="pay-sub-row-'+i+'">';
      itemList+='<td style="padding:8px;text-align:center"><input type="checkbox" class="pay-sub-chk" value="'+i+'" onchange="onPaySubChkChange(this,'+i+')" '+disabledAttr+'></td>';
      itemList+='<td style="padding:8px"><span class="tag-gray">子订单</span></td>';
      itemList+='<td style="padding:8px">'+esc(it.subBn||'')+'</td>';
      itemList+='<td style="padding:8px">'+esc(it.co||'-')+'</td>';
      itemList+='<td style="padding:8px" title="'+esc(it.addr||'')+'">'+esc((it.addr||'-').substring(0,30))+'</td>';
      itemList+='<td style="padding:8px;text-align:right">'+statusExtra+'</td>';
      itemList+='</tr>';
      selectableCount++;
    }
  }
  itemList+='</tbody></table></div>';
  
  var body='<form id="pay-parent-form">'
    +'<div style="margin-bottom:12px;color:#666;font-size:13px">'
    +'请选择要添加收款记录的订单：<br>'
    +'<span style="color:#10b981">选择母订单：收款金额将平均分配给所有未收款子订单</span><br>'
    +'<span style="color:#666">选择子订单：收款金额将平均分配给选中的子订单</span>'
    +'</div>'
    +pendingHtml
    +'<div id="selection-info" style="margin-bottom:12px;padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:13px;display:none"></div>'
    +itemList
    +'</form>';
  
  showModal('选择订单',body,function(){
    document.querySelector('.modal-box')&&document.querySelector('.modal-box').classList.add('modal-box-wide');
    // 收集选中状态
    var selectedParent=document.getElementById('pay-parent-chk')&&document.getElementById('pay-parent-chk').checked;
    var selectedSubs=[];
    var subChks=document.querySelectorAll('.pay-sub-chk:checked');
    for(var j=0;j<subChks.length;j++){
      selectedSubs.push(parseInt(subChks[j].value));
    }
    
    if(!selectedParent&&selectedSubs.length===0){
      toast('请至少选择一个订单','error');return;
    }
    
    // 直接打开收款表单（不管是否选中母订单，都按选中的子订单走）
    setTimeout(function(){
      openPayFromSubs(oid, selectedSubs);
    }, 50);
  },true);
  // 弹窗加宽
  var payBox=$('modal-overlay').querySelector('.modal-box');
  if(payBox)payBox.classList.add('modal-box-wide');
  initResizableTable('pay-select-table');
}

// 母订单复选框 - 联选逻辑（选中则全选所有可选子订单）
function onPayParentChkChange(chk){
  var subChks=document.querySelectorAll('.pay-sub-chk:not(:disabled)');
  for(var i=0;i<subChks.length;i++){subChks[i].checked=chk.checked;}
}

// 子订单复选框 - 联选逻辑（选满则自动勾选母订单）
function onPaySubChkChange(chk, idx){
  var parentChk=document.getElementById('pay-parent-chk');
  var allChks=document.querySelectorAll('.pay-sub-chk:not(:disabled)');
  var checkedChks=document.querySelectorAll('.pay-sub-chk:checked:not(:disabled)');
  if(parentChk) parentChk.checked=(allChks.length>0&&allChks.length===checkedChks.length);
}

// 按batchId批量删除收款申请记录（与支出版本逻辑一致）
function deletePayRecordByBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 判断是否为无 batchId 的老数据的虚拟 key
  var isNoBatch = batchId && (batchId.indexOf('__noBatch_')===0 || batchId.indexOf('__no_')===0);
  var nbSubIdx = -1, nbRecIdx = -1;
  if(isNoBatch){
    var parts = batchId.split('_');
    nbSubIdx = parseInt(parts[parts.length-2]);
    nbRecIdx = parseInt(parts[parts.length-1]);
  }
  confirmDialog('确定删除整批收款申请记录？',function(){
    var deleted=0;
    if(o.items){
      for(var i=0;i<o.items.length;i++){
        var it=o.items[i];
        if(!it.pr_records)continue;
        for(var rj=it.pr_records.length-1;rj>=0;rj--){
          var rec=it.pr_records[rj];
          var match = rec.batchId===batchId;
          if(!match && isNoBatch){
            match = (i===nbSubIdx && rj===nbRecIdx);
          }
          if(!match) continue;
          if(rec.pf&&curRole!=='admin'&&curRole!=='finance'&&curRole!=='gm'){continue;}
          it.pr_records.splice(rj,1);
          it.itemStatus='draft';
          deleted++;
        }
        // 如果该子订单的收款记录全部删完了，重置收款金额
        if(it.pr_records.length===0){
          it.pm=0;it.pd='';it.pa='';it.ppm='';
        }
      }
    }
    if(deleted===0){toast('没有可删除的记录','error');return;}
    sumOrder(o);
    syncAll();
    // 如果订单详情弹窗是打开的，移除它
    var detailOv=document.querySelector('.order-detail-overlay');
    if(detailOv) detailOv.remove();
    // 原地刷新弹窗（不关闭）
    var modalOv2=document.getElementById('modal-overlay');
    if(modalOv2&&$('modal-title')&&$('modal-title').textContent==='选择订单'){
      if(document.getElementById('exp-parent-row')){
        openExpFromParent(oid);
      }else if(document.getElementById('pay-parent-row')){
        openPayFromParent(oid);
      }else{
        refreshPayAppTable(oid);
      }
      // 弹出 showModal 刚保存的旧状态
      if(window._modalStack&&window._modalStack.length>0){
        window._modalStack.pop();
      }
    }else{
      refreshPayAppTable(oid);
    }
    renderApprovalPage();renderOrdersTable();renderDashboard();
    renderPerformance();renderSalaryPage();renderIncomeTable();renderExpensesTable();
    toast('已删除'+deleted+'条记录');
  },{title:'批量删除',okText:'确认删除'});
}

// 刷新当前选择订单弹窗（关闭后用最新数据重新打开）
function refreshCurrentPayModal(oid){
  var modalBody=document.querySelector('#modal-overlay .modal-body');
  if(modalBody&&$('modal-title')&&$('modal-title').textContent==='选择订单'){
    openPayFromParent(oid);
    if(window._modalStack&&window._modalStack.length>0){
      window._modalStack.pop();
    }
    return;
  }
  openPayFromParent(oid);
}

// 更新选择提示信息
function updatePaySelectionInfo(msg){
  var infoDiv=document.getElementById('selection-info');
  if(infoDiv){
    if(msg){
      infoDiv.style.display='';
      infoDiv.innerHTML='<span style="color:#10b981">'+msg+'</span>';
    } else {
      var checkedSubs=[];
      var subChks=document.querySelectorAll('.pay-sub-chk:checked');
      for(var i=0;i<subChks.length;i++){
        checkedSubs.push(parseInt(subChks[i].value)+1);
      }
      if(checkedSubs.length>0){
        infoDiv.style.display='';
        infoDiv.innerHTML='已选择 '+checkedSubs.length+' 个子订单，收款将平均分配给选中的子订单';
      } else {
        infoDiv.style.display='none';
      }
    }
  }
}

// 打开批量收款表单（从子订单选择）
function openPayFromSubs(oid, selectedSubs){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 设置上下文：显示已选子订单的待审批记录
  window._currentPayModalContext={oid:oid, subIndices:selectedSubs, openFunction:'openPayFromSubs', arg1:oid, arg2:selectedSubs};
  
  var count=selectedSubs.length;
  var tableId='batch-pay-table';
  var pendingHtml='';
  try{
    pendingHtml=buildPendingPaySection(oid,selectedSubs);
  }catch(e){
    pendingHtml='<div style="color:#ef4444;padding:8px">⚠️ 待审批记录加载失败</div>';
  }
  var rejectedHtml='';
  try{
    rejectedHtml=buildRejectedPaySection(oid,selectedSubs);
  }catch(e){
    rejectedHtml='<div style="color:#ef4444;padding:8px">⚠️ 已驳回记录加载失败</div>';
  }
  // 加载保存的列宽
  var _defaultWidths={col_0:80,col_1:120,col_2:150,col_3:100};
  var savedWidths=loadColWidths(tableId,_defaultWidths)||_defaultWidths;
  
  // 构建子订单编辑列表HTML
  var subListHtml='<div style="margin-top:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">';
  subListHtml+='<div style="background:#f9fafb;padding:10px 12px;font-weight:600;font-size:13px;border-bottom:1px solid #e5e7eb">收款明细（拖动表头边缘可调整列宽）</div>';
  subListHtml+='<div style="max-height:250px;overflow-y:auto">';
  subListHtml+='<table id="'+tableId+'" class="resizable-table" style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">';
  subListHtml+='<thead><tr style="background:#f3f4f6">';
  subListHtml+='<th style="padding:8px;text-align:left;width:'+savedWidths.col_0+'px;min-width:'+savedWidths.col_0+'px">子订单号<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:left;width:'+savedWidths.col_1+'px;min-width:'+savedWidths.col_1+'px">单位名称<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:left;width:'+savedWidths.col_2+'px;min-width:'+savedWidths.col_2+'px">地址<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:right;width:'+savedWidths.col_3+'px;min-width:'+savedWidths.col_3+'px">收款金额<span class="col-resizer"></span></th>';
  subListHtml+='</tr></thead>';
  subListHtml+='<tbody id="batch-pay-items-tbody">';
  
  // 计算所选子订单的默认收款金额：报价 - 已收款
  var totalPr=0;
  var subDefaults=[];
  for(var pi=0;pi<selectedSubs.length;pi++){
    var piIt=o.items[selectedSubs[pi]];
    if(piIt){
      var unpaid=(parseFloat(piIt.pr)||0)-getSubPay(piIt)-getSubPayPending(piIt);
      if(unpaid<0)unpaid=0;
      subDefaults.push(unpaid);
      totalPr+=unpaid;
    }else{
      subDefaults.push(0);
    }
  }
  
  for(var i=0;i<selectedSubs.length;i++){
    var idx=selectedSubs[i];
    var it=o.items[idx];
    if(it){
      var subBn=it.subBn||'子'+idx;
      var co=it.co||'-';
      var addr=(it.addr||'-').substring(0,20);
      subListHtml+='<tr style="border-bottom:1px solid #f3f4f6" id="batch-pay-row-'+i+'">';
      subListHtml+='<td style="padding:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="tag-gray">'+esc(subBn)+'</span></td>';
      subListHtml+='<td style="padding:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(co)+'">'+esc(co)+'</td>';
      subListHtml+='<td style="padding:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(it.addr||'')+'">'+esc(it.addr||'-')+'</td>';
      subListHtml+='<td style="padding:8px;text-align:right"><input type="number" id="batch-pay-amt-'+i+'" data-idx="'+idx+'" class="batch-pay-amt-input" style="width:80px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;text-align:right" value="'+(subDefaults[i]||0).toFixed(2)+'" oninput="onBatchPayAmtChange('+count+')"/></td>';
      subListHtml+='</tr>';
    }
  }
  subListHtml+='</tbody>';
  subListHtml+='<tfoot><tr style="background:#fef3c7;font-weight:600"><td colspan="3" style="padding:8px;text-align:right">总金额：</td><td style="padding:8px;text-align:right"><span id="batch-pay-actual-total" style="color:#f59e0b">¥0.00</span></td></tr></tfoot>';
  subListHtml+='</table></div></div>';
  subListHtml+='<div id="batch-pay-total-error" style="margin-top:8px;color:#ef4444;font-size:12px;display:none">⚠️ 手动修改的金额总和与收款总金额不一致！</div>';
  
  var body='<form id="batch-pay-form">'
    +'<div style="margin-bottom:12px;color:#666;font-size:13px">'
    +'已选择 <b style="color:#10b981">'+count+'</b> 个子订单，默认收款金额为各子订单剩余未收金额（报价-已收）</div>'
    +'</div>'
    +'<div class="form-grid">'
    +'<div class="form-group"><label>收款方式</label><select name="payMethod" id="batch-pay-method">'
    +'<option value="scan">扫码</option>'
    +'<option value="bank">对公</option>'
    +'</select></div>'
    +'<div class="form-group"><label>收款账号</label>'+buildPayAccountOpts(o.sl,'','payAccount')+'</div>'
    +'<div class="form-group"><label>收款总金额</label><input type="number" name="totalAmount" id="batch-pay-total" value="'+(totalPr>0?totalPr.toFixed(2):'')+'" oninput="onBatchPayTotalChange('+count+')"/></div>'
    +'<div class="form-group"><label>收款时间</label><input type="date" name="payDate" value="'+todayStr()+'"/></div>'
    +'<div class="form-group full"><label>备注</label><input name="remark" placeholder="可选"/></div>'
    +'<div class="form-group full"><label>凭证截图</label><input type="file" id="batch-pay-img" accept="image/*" multiple onchange="previewBatchPayImg(this)"/></div>'
    +'<div id="batch-pay-img-preview" style="display:none;margin-top:8px"></div>'
    +'</div>'
    +subListHtml
    +'</form>';
  
  showModal('批量收款',body,function(){
    // 初始化可调整列宽功能
    initResizableTable(tableId);
    
    var f=getFormData('batch-pay-form');
    var totalAmt=parseFloat(f.totalAmount)||0;
    if(totalAmt<=0){toast('请输入收款总金额','error');return;}
    
    // 验证金额总和
    var actualTotal=0;
    var amounts=[];
    for(var i=0;i<count;i++){
      var amt=parseFloat(document.getElementById('batch-pay-amt-'+i).value)||0;
      amounts.push(amt);
      actualTotal+=amt;
    }
    actualTotal=Math.round(actualTotal*100)/100;
    
    if(Math.abs(actualTotal-totalAmt)>0.01){
      toast('各订单金额总和必须等于收款总金额（当前差¥'+(actualTotal-totalAmt).toFixed(2)+'）','error');
      return;
    }
    
    var method=f.payMethod;
    var payAccount=f.payAccount||'';
    var payDate=f.payDate||todayStr();
    var remark=f.remark||'';
    // ★ 先上传图片到服务端，再保存数据
    var pendingFiles=_pendingImgFiles['batch-pay-img']||[];
    var doSave=function(imgUrls){
      var imgUrl=makeImgUrls(imgUrls);
      // 为每个选中的子订单添加收款记录（共享 batchId）
      var batchId='batch_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
      for(var i=0;i<selectedSubs.length;i++){
        var idx=selectedSubs[i];
        if(o.items&&o.items[idx]){
          var it=o.items[idx];
          if(!it.pr_records)it.pr_records=[];
          it.pr_records.push({
            batchId:batchId,
            payNo:genPayNo(o, it),
            ppm:method,
            ppa:payAccount,
            pm:amounts[i],
            pd:payDate,
            px:remark,
            pxi:imgUrl
          });
        // 同步更新子订单的收款相关字段
        it.pm=amounts[i];
        it.pd=payDate;
        it.pa=payAccount;
        it.ppm=method;
        // 如果子订单状态是草稿，改为审批中
        if(it.itemStatus==='draft'||!it.itemStatus){
          it.itemStatus='pending';
        }
      }
    }
    
    syncAll();
    delete _pendingImgFiles['batch-pay-img'];
    toast('批量收款记录已提交，等待审批（共'+count+'单）');
    closeAllModals();
    renderOrdersTable();
    renderApprovalPage();
    };
    
    if(pendingFiles.length){
      uploadMultipleImages(pendingFiles).then(function(urls){doSave(urls);}).catch(function(e){console.error('上传失败:',e);doSave([]);});
    }else{
      doSave([]);
    }
  });
}

// 收款总金额变化时，重新平均分配
function onBatchPayTotalChange(count){
  var total=parseFloat(document.getElementById('batch-pay-total').value)||0;
  var avg=Math.round(total/count*100)/100;
  
  // 更新各子订单的金额
  for(var i=0;i<count;i++){
    var input=document.getElementById('batch-pay-amt-'+i);
    if(input){
      input.value=avg.toFixed(2);
    }
  }
  updateBatchPayActualTotal();
}

// 单个子订单金额变化时检查总额
function onBatchPayAmtChange(count){
  updateBatchPayActualTotal();
}

// 更新实际总金额显示
function updateBatchPayActualTotal(){
  var inputs=document.querySelectorAll('.batch-pay-amt-input');
  var total=0;
  for(var i=0;i<inputs.length;i++){
    total+=parseFloat(inputs[i].value)||0;
  }
  total=Math.round(total*100)/100;
  
  var displayEl=document.getElementById('batch-pay-actual-total');
  var errorEl=document.getElementById('batch-pay-total-error');
  var inputTotal=parseFloat(document.getElementById('batch-pay-total').value)||0;
  
  if(displayEl){
    displayEl.textContent='¥'+total.toFixed(2);
  }
  
  if(errorEl){
    if(Math.abs(total-inputTotal)>0.01 && inputTotal>0){
      errorEl.style.display='';
    } else {
      errorEl.style.display='none';
    }
  }
}

// 切换批量收款支付方式显示（扫码和对公都只需截图，无需切换）
function toggleBatchPayMethodInfo(method){
  // 两种方式都只需要上传截图，无需额外信息
}

// 预览批量收款截图
function previewBatchPayImg(input){
  if(input.files&&input.files.length>0){
    var files=Array.prototype.slice.call(input.files);
    // 追加到现有待上传文件列表
    var existing=_pendingImgFiles['batch-pay-img']||[];
    _pendingImgFiles['batch-pay-img']=existing.concat(files);
    var preview=document.getElementById('batch-pay-img-preview');
    if(preview){preview.style.display='';/* 不清除已有缩略图 */}
    for(var i=0;i<files.length;i++){
      (function(file){
        var r=new FileReader();
        r.onload=function(e){
          var wrap=buildPendingImgWrap(e.target.result,'batch-pay-img',file);
          if(preview)preview.appendChild(wrap);
        };
        r.readAsDataURL(file);
      })(files[i]);
    }
  }
}

// 母订单收款申请弹窗
function openPayFromParentOrder(oid, selectedSubs){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  _currentPayItem={order:o,item:null,idx:-1,isParent:true};
  // 设置上下文：显示该订单所有子订单的待审批记录
  window._currentPayModalContext={oid:oid, subIndices:null, openFunction:'openPayFromParentOrder', arg1:oid, arg2:null};
  
  // 构建待审批记录区域（try-catch保护）
  var pendingHtml='';
  try{
    pendingHtml=buildPendingPaySection(oid,null);
  }catch(e){
    pendingHtml='<div style="color:#ef4444;padding:8px">⚠️ 待审批记录加载失败</div>';
  }
  var rejectedHtml='';
  try{
    rejectedHtml=buildRejectedPaySection(oid,null);
  }catch(e){
    rejectedHtml='<div style="color:#ef4444;padding:8px">⚠️ 已驳回记录加载失败</div>';
  }
  
  // 统计未收款的子订单数量
  var selectableSubs=[];
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      selectableSubs.push(i);
    }
  }
  var count=selectableSubs.length;
  if(count===0){toast('没有可收款的子订单','error');return;}
  var tableId='parent-pay-table';
  // 加载保存的列宽
  var _defaultWidths2={col_0:80,col_1:120,col_2:150,col_3:100};
  var savedWidths=loadColWidths(tableId,_defaultWidths2)||_defaultWidths2;
  
  var payMethod=o.ppm||'';
  var payImg=o.pxi||'';
  var payCreateGid='payCreate_parent_'+oid;
  window._editImgData=window._editImgData||{};
  window._editImgData[payCreateGid]=payImg;

  // 构建子订单明细表格HTML
  var subListHtml='<div style="margin-top:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">';
  subListHtml+='<div style="background:#f9fafb;padding:10px 12px;font-weight:600;font-size:13px;border-bottom:1px solid #e5e7eb">收款明细（拖动表头边缘可调整列宽）</div>';
  subListHtml+='<div style="max-height:250px;overflow-y:auto">';
  subListHtml+='<table id="'+tableId+'" class="resizable-table" style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">';
  subListHtml+='<thead><tr style="background:#f3f4f6">';
  subListHtml+='<th style="padding:8px;text-align:left;width:'+savedWidths.col_0+'px;min-width:'+savedWidths.col_0+'px">子订单号<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:left;width:'+savedWidths.col_1+'px;min-width:'+savedWidths.col_1+'px">单位名称<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:left;width:'+savedWidths.col_2+'px;min-width:'+savedWidths.col_2+'px">地址<span class="col-resizer"></span></th>';
  subListHtml+='<th style="padding:8px;text-align:right;width:'+savedWidths.col_3+'px;min-width:'+savedWidths.col_3+'px">收款金额<span class="col-resizer"></span></th>';
  subListHtml+='</tr></thead>';
  subListHtml+='<tbody id="parent-pay-items-tbody">';
  
  // 计算可收款的子订单默认金额：报价 - 已收款
  var totalPr=0;
  var subDefaults2=[];
  for(var psi=0;psi<selectableSubs.length;psi++){
    var pIt=o.items[selectableSubs[psi]];
    if(pIt){
      var unpaid=(parseFloat(pIt.pr)||0)-getSubPay(pIt)-getSubPayPending(pIt);
      if(unpaid<0)unpaid=0;
      subDefaults2.push(unpaid);
      totalPr+=unpaid;
    }else{
      subDefaults2.push(0);
    }
  }
  
  for(var si=0;si<selectableSubs.length;si++){
    var idx=selectableSubs[si];
    var it=o.items[idx];
    if(it){
      var subBn=it.subBn||'子'+idx;
      var co=it.co||'-';
      var addr=(it.addr||'-').substring(0,20);
      subListHtml+='<tr style="border-bottom:1px solid #f3f4f6" id="parent-pay-row-'+si+'">';
      subListHtml+='<td style="padding:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="tag-gray">'+esc(subBn)+'</span></td>';
      subListHtml+='<td style="padding:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(co)+'">'+esc(co)+'</td>';
      subListHtml+='<td style="padding:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(it.addr||'')+'">'+esc(it.addr||'-')+'</td>';
      subListHtml+='<td style="padding:8px;text-align:right"><input type="number" id="parent-pay-amt-'+si+'" data-idx="'+idx+'" class="parent-pay-amt-input" style="width:80px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;text-align:right" value="'+(subDefaults2[si]||0).toFixed(2)+'" oninput="onParentPayAmtChange('+count+')"/></td>';
      subListHtml+='</tr>';
    }
  }
  subListHtml+='</tbody>';
  subListHtml+='<tfoot><tr style="background:#fef3c7;font-weight:600"><td colspan="3" style="padding:8px;text-align:right">总金额：</td><td style="padding:8px;text-align:right"><span id="parent-pay-actual-total" style="color:#f59e0b">¥0.00</span></td></tr></tfoot>';
  subListHtml+='</table></div></div>';
  subListHtml+='<div id="parent-pay-total-error" style="margin-top:8px;color:#ef4444;font-size:12px;display:none">⚠️ 手动修改的金额总和与收款总金额不一致！</div>';
  
  var body='<form id="pay-item-form">'
    +'<div style="margin-bottom:12px;color:#666;font-size:13px">'
    +'默认收款金额为各子订单剩余未收金额（报价-已收），总计 <b style="color:#10b981">'+count+'</b> 个未收款子订单'
    +'</div>'
    +'<div class="form-grid">'
    +'<div class="form-group"><label>业务编号</label><input value="'+esc(o.bn||'')+'" disabled style="background:#f5f5f5"/></div>'
    +'<div class="form-group"><label>收款总金额</label><input type="number" name="payAmount" id="parent-pay-total" value="'+(totalPr>0?totalPr.toFixed(2):'0')+'" oninput="onParentPayTotalChange('+count+')"/></div>'
    +'<div class="form-group"><label>收款时间</label><input type="date" name="payDate" value="'+(o.ppd||todayStr())+'"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>收款方式</label><select name="payMethod" id="pay-method-select">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="scan"'+(payMethod==='scan'?' selected':'')+'>扫码</option>'
    +'<option value="bank"'+(payMethod==='bank'?' selected':'')+'>对公</option>'
    +'</select></div>'
    +'<div class="form-group"><label>收款账号</label>'+buildPayAccountOpts(o.sl,o.ppa||'','payAccount')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>凭证截图</label>'
    +'<input type="file" id="pay-img-input" accept="image/*" multiple onchange="previewPayImg(this)"/>'
    +'<div id="pay-img-preview"'+(payImg?'':' style="display:none"')+'>'+(payImg?renderImgThumbs(payImg,'width:80px;height:80px;object-fit:cover;border-radius:4px;margin:3px;border:1px solid #e2e8f0;cursor:pointer;','',true,payCreateGid):'')+'</div>'
    +'</form>';
  showModal('母订单批量收款',body,function(){
    // 初始化可调整列宽功能
    initResizableTable(tableId);
    
    var curO=DB_ORDERS.find(function(x){return x.id===oid;});
    if(!curO){toast('订单不存在','error');return;}
    var f=getFormData('pay-item-form');
    var totalAmt=parseFloat(f.payAmount)||0;
    if(totalAmt<=0){toast('请输入收款总金额','error');return}
    if(count===0){toast('没有可收款的子订单','error');return}
    
    // 验证金额总和
    var amounts=[];
    for(var ai=0;ai<count;ai++){
      var amt=parseFloat(document.getElementById('parent-pay-amt-'+ai).value)||0;
      amounts.push(amt);
    }
    var actualTotal=Math.round(amounts.reduce(function(a,b){return a+b;},0)*100)/100;
    
    if(Math.abs(actualTotal-totalAmt)>0.01){
      toast('各订单金额总和必须等于收款总金额（当前差¥'+(actualTotal-totalAmt).toFixed(2)+'）','error');
      return;
    }
    
    var pendingFiles=_pendingImgFiles['pay-img-input']||[];
    var doSave=function(imgUrls){
    var imgUrl=makeImgUrls(imgUrls);
    // 为每个未收款的子订单添加收款记录（共享 batchId）
    var batchId='batch_'+Date.now()+'_'+Math.random().toString(36).substr(2,6);
    var assignedCount=0;
    for(var i=0;i<selectableSubs.length;i++){
      var idx=selectableSubs[i];
      if(curO.items&&curO.items[idx]){
        var it=curO.items[idx];
        if(!it.pr_records)it.pr_records=[];
        it.pr_records.push({
          batchId:batchId,
          payNo:genPayNo(curO, it),
          ppm:f.payMethod,
          ppa:f.payAccount,
          pm:amounts[i],
          pd:f.payDate,
          px:f.remark||'',
          pxi:imgUrl
        });
        // 同步更新子订单的收款相关字段
        it.pm=amounts[i];
        it.pd=f.payDate;
        it.pa=f.payAccount;
        it.ppm=f.payMethod;
        // 如果子订单状态是草稿，改为审批中
        if(it.itemStatus==='draft'||!it.itemStatus){
          it.itemStatus='pending';
        }
        assignedCount++;
      }
    }
    
    syncAll();
    delete _pendingImgFiles['pay-img-input'];
    toast('母订单批量收款已提交，等待审批（共'+assignedCount+'单）');
    closeAllModals();
    renderOrdersTable();
    renderApprovalPage();
    };
    
    if(pendingFiles.length){
      uploadMultipleImages(pendingFiles).then(function(urls){
        var existingUrls=parseImgUrls(window._editImgData[payCreateGid]||"");
        var mergedUrls=existingUrls.concat(urls);
        doSave(mergedUrls);
      }).catch(function(e){console.error('上传失败:',e);doSave(parseImgUrls(window._editImgData[payCreateGid]||""));});
    }else{
      doSave(parseImgUrls(window._editImgData[payCreateGid]||""));
    }
  });
}

// 母订单收款总金额变化时，重新平均分配
function onParentPayTotalChange(count){
  var total=parseFloat(document.getElementById('parent-pay-total').value)||0;
  var avg=Math.round(total/count*100)/100;
  
  // 更新各子订单的金额
  for(var i=0;i<count;i++){
    var input=document.getElementById('parent-pay-amt-'+i);
    if(input){
      input.value=avg.toFixed(2);
    }
  }
  updateParentPayActualTotal();
}

// 单个子订单金额变化时检查总额
function onParentPayAmtChange(count){
  updateParentPayActualTotal();
}

// 更新母订单收款实际总金额显示
function updateParentPayActualTotal(){
  var inputs=document.querySelectorAll('.parent-pay-amt-input');
  var total=0;
  for(var i=0;i<inputs.length;i++){
    total+=parseFloat(inputs[i].value)||0;
  }
  total=Math.round(total*100)/100;
  
  var displayEl=document.getElementById('parent-pay-actual-total');
  var errorEl=document.getElementById('parent-pay-total-error');
  var inputTotal=parseFloat(document.getElementById('parent-pay-total').value)||0;
  
  if(displayEl){
    displayEl.textContent='¥'+total.toFixed(2);
  }
  
  if(errorEl){
    if(Math.abs(total-inputTotal)>0.01 && inputTotal>0){
      errorEl.style.display='';
    } else {
      errorEl.style.display='none';
    }
  }
}

// 子订单收款申请弹窗
function openPayFromItem(oid,idx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  if(!o.items||!o.items[idx]){toast('子订单不存在','error');return;}
  var it=o.items[idx];
  _currentPayItem={order:o,item:it,idx:idx,isParent:false};
  // 设置上下文，供待审批记录区域的撤回/删除回调刷新用
  window._currentPayModalContext={oid:oid, subIndices:[idx], openFunction:'openPayFromItem', arg1:oid, arg2:idx};
  var payMethod=it.ppm||'';
  var payImg=it.pxi||'';
  var payCreateGid='payCreate_'+oid+'_'+idx;
  window._editImgData=window._editImgData||{};
  window._editImgData[payCreateGid]=payImg;
  // 顶部插入待审批记录区域
  var pendingHtml='';
  try{ pendingHtml=buildPendingPaySection(oid,[idx]); }catch(e){ pendingHtml='<div style="color:#ef4444;padding:8px">⚠️ 待审批记录加载失败</div>'; }
  var rejectedHtml='';
  try{ rejectedHtml=buildRejectedPaySection(oid,[idx]); }catch(e){ rejectedHtml='<div style="color:#ef4444;padding:8px">⚠️ 已驳回记录加载失败</div>'; }
  var body=pendingHtml+rejectedHtml;
  body+='<form id="pay-item-form"><div class="form-grid">'
    +'<div class="form-group"><label>子订单编号</label><input value="'+esc(it.subBn||'')+'" disabled style="background:#f5f5f5"/></div>'
    +'<div class="form-group"><label>收款时间</label><input type="date" name="payDate" value="'+(it.ppd||todayStr())+'"/></div>'
    +'<div class="form-group"><label>收款金额</label><input type="number" name="payAmount" value="'+Math.max(0,(it.pr||0)-getSubPay(it)).toFixed(2)+'"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>收款方式</label><select name="payMethod" id="pay-method-select">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="scan"'+(payMethod==='scan'?' selected':'')+'>扫码</option>'
    +'<option value="bank"'+(payMethod==='bank'?' selected':'')+'>对公</option>'
    +'</select></div>'
    +'<div class="form-group"><label>收款账号</label>'+buildPayAccountOpts(o.sl,it.ppa||'','payAccount')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>凭证截图</label>'
    +'<input type="file" id="pay-img-input" accept="image/*" multiple onchange="previewPayImg(this)"/>'
    +'<div id="pay-img-preview"'+(payImg?'':' style="display:none"')+'>'+(payImg?renderImgThumbs(payImg,'width:80px;height:80px;object-fit:cover;border-radius:4px;margin:3px;border:1px solid #e2e8f0;cursor:pointer;','',true,payCreateGid):'')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>备注</label><input name="remark" value="'+esc(it.pr_rk||'')+'" placeholder="请输入备注"/></div>'
    +'</form>';
  showModal('子订单收款申请',body,function(){
    var curO=DB_ORDERS.find(function(x){return x.id===oid;});
    if(!curO){toast('订单不存在','error');return;}
    if(!curO.items||!curO.items[idx]){toast('子订单不存在','error');return;}
    var curIt=curO.items[idx];
    var f=getFormData('pay-item-form');
    if(!f.payAmount||f.payAmount<=0){toast('请输入收款金额','error');return}
    var payAmt=parseFloat(f.payAmount)||0;
    var pendingFiles=_pendingImgFiles['pay-img-input']||[];
    var doSave=function(imgUrls){
    var imgUrl=makeImgUrls(imgUrls);
    // 保存到子订单的收款记录数组
    if(!curIt.pr_records)curIt.pr_records=[];
    var payRecord={
      batchId:'batch_'+Date.now()+'_'+Math.random().toString(36).substr(2,6),
      payNo:genPayNo(curO, curIt),
      pd:f.payDate,
      pm:payAmt,
      ppm:f.payMethod,
      ppa:f.payAccount,
      pxi:imgUrl,
      pr_rk:f.remark||'',
      psub:true,
      psubIdx:idx
    };
    curIt.pr_records.push(payRecord);
    // 同步更新子订单的收款相关字段
    curIt.pm=payAmt;
    curIt.pd=f.payDate;
    curIt.pa=f.payAccount;
    curIt.ppm=f.payMethod;
    syncAll();
    delete _pendingImgFiles['pay-img-input'];
    renderOrdersTable();
    toast('子订单收款已提交');
    closeAllModals();
    };
    
    if(pendingFiles.length){
      uploadMultipleImages(pendingFiles).then(function(urls){
        var existingUrls=parseImgUrls(window._editImgData[payCreateGid]||"");
        var mergedUrls=existingUrls.concat(urls);
        doSave(mergedUrls);
      }).catch(function(e){console.error('上传失败:',e);doSave(parseImgUrls(window._editImgData[payCreateGid]||""));});
    }else{
      doSave(parseImgUrls(window._editImgData[payCreateGid]||""));
    }
  });
}

// 切换收款方式显示/隐藏详情（扫码和对公都只需截图，无需切换）
function togglePayInfo(method){
  // 两种方式都只需要上传截图，无需额外信息
}

// 预览收款凭证图片（支持多文件）
function previewPayImg(input){
  if(input.files&&input.files.length>0){
    var key=input.id||'pay-img-input';
    var files=Array.prototype.slice.call(input.files);
    // 追加到现有待上传文件列表
    var existing=_pendingImgFiles[key]||[];
    _pendingImgFiles[key]=existing.concat(files);
    var preview=document.getElementById('pay-img-preview');
    var editPreview=document.getElementById('edit-pay-img-preview');
    if(preview)preview.style.display='block';
    if(editPreview)editPreview.style.display='block';
    for(var i=0;i<files.length;i++){
      (function(file){
        var reader=new FileReader();
        reader.onload=function(e){
          var dataUrl=e.target.result;
          if(preview)preview.appendChild(buildPendingImgWrap(dataUrl,key,file));
          if(editPreview)editPreview.appendChild(buildPendingImgWrap(dataUrl,key,file));
        };
        reader.readAsDataURL(file);
      })(files[i]);
    }
  }
}

// 确认收款审批
// 按批次整组确认收款
function approvePayBatch(batchId, oid){
  console.log('approvePayBatch called', batchId, oid);
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 收集同一 batchId 的所有待确认记录
  var batchRecords=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.pr_records)continue;
      for(var rj=0;rj<it.pr_records.length;rj++){
        var rec=it.pr_records[rj];
        if(rec.batchId===batchId&&!rec.pf){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的待审批记录','error');return;}
  var totalAmt=0;
  for(var ti=0;ti<batchRecords.length;ti++) totalAmt+=(batchRecords[ti].rec.pm||0);
  totalAmt=Math.round(totalAmt*100)/100;
  var firstRec=batchRecords[0].rec;
  // 构建申请信息摘要
  var payDetail={};
  try{payDetail=firstRec.pxb?JSON.parse(firstRec.pxb):{};}catch(e){}
  var methodText=PAY_METHOD_MAP[firstRec.ppm]||firstRec.ppm||'-';
  var accountText=firstRec.ppa||'-';
  if(firstRec.ppm==='alipay_account')accountText=(payDetail.alipayAccount||'')+' '+(payDetail.alipayName||'');
  else if(firstRec.ppm==='bank')accountText=(payDetail.bankName||'')+' '+(payDetail.bankAccount||'');
  var appInfo='<div style="background:#f0fdf4;padding:10px;border-radius:6px;margin-bottom:12px;font-size:12px;line-height:1.6">'
    +'<div style="font-weight:600;color:#059669;margin-bottom:6px">📋 申请人提交信息</div>'
    +'<span>申请金额：<b>'+fmtM(totalAmt)+'</b></span><br/>'
    +'<span>收款方式：<b>'+esc(methodText)+'</b></span><br/>'
    +'<span>收款账号：<b>'+esc(accountText)+'</b></span><br/>'
    +(firstRec.pxi?'<span>凭证截图：'+renderImgThumbs(firstRec.pxi,'width:60px;height:60px;object-fit:cover;border-radius:4px;cursor:pointer;margin:2px;border:1px solid #e2e8f0;')+'</span><br/>':'')
    +(firstRec.px||firstRec.pr_rk?'<span>备注：<b style="color:#6b7280">'+esc(firstRec.px||firstRec.pr_rk)+'</b></span>':'')
    +'</div>';
  var body='<form id="approve-batch-pay-form">'+appInfo+'<div class="form-grid">'
    +'<div class="form-group"><label>确认收款时间</label><input type="date" name="confirmDate" value="'+todayStr()+'"/></div>'
    +'<div class="form-group"><label>确认收款总金额</label><input type="number" name="confirmAmount" value="'+totalAmt.toFixed(2)+'" placeholder="请输入确认金额"/></div>'
    +'</div><div class="form-group" style="margin-top:8px"><label>确认备注</label><input name="confirmRemark" placeholder="可选，填写确认收款备注"/></div></form>';
  showModal('确认收款（整组'+batchRecords.length+'单）',body,function(){
    var f=getFormData('approve-batch-pay-form');
    if(!f.confirmAmount||f.confirmAmount<=0){toast('请输入收款金额','error');return}
    var confirmTotal=parseFloat(f.confirmAmount)||0;
    // 按比例分配确认金额到各子订单
    for(var ai=0;ai<batchRecords.length;ai++){
      var br=batchRecords[ai];
      var ratio=(br.rec.pm||0)/totalAmt;
      var confirmAmt=Math.round(confirmTotal*ratio*100)/100;
      br.rec.pf=todayStr();
      br.rec.pf_actual=f.confirmDate;
      br.rec.pf_amount=confirmAmt;
      br.rec.pf_rk=f.confirmRemark||'';
      br.rec.pf_user=curUser.name;
      // 同步更新子订单字段
      br.it.pm=confirmAmt;
      br.it.pd=f.confirmDate;
      br.it.ppm=br.rec.ppm;
      br.it.pa=br.rec.ppa;
      br.it.itemStatus='approved';
      // 重新计算子订单收益：收益 = 收款 - 支出 - 成本
      br.it.profit=(br.it.pm||0)-(br.it.xm||0)-(br.it.cost||0);
      // 付款后同步更新地址（所有业务类型）
      syncSubOrderToAddress(br.it, o);
    }
    // 更新母订单汇总
    sumOrder(o);
    syncAll();
    updateParentOrderStatus(o);
    renderOrdersTable();
    renderApprovalPage();
    addNotification('收款确认: 共'+batchRecords.length+'单','success');
    toast('收款已确认（共'+batchRecords.length+'单）');
    closeAllModals();
  });
}

// 按批次整组驳回收款
function rejectPayBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 收集同一 batchId 的所有待确认记录
  var batchRecords=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.pr_records)continue;
      for(var rj=0;rj<it.pr_records.length;rj++){
        var rec=it.pr_records[rj];
        if(rec.batchId===batchId&&!rec.pf){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的待审批记录','error');return;}
  var body='<form id="reject-batch-pay-form"><div class="form-group"><label>驳回原因</label><textarea name="rejectReason" rows="3" placeholder="请输入驳回原因" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;resize:vertical"></textarea></div></form>';
  showModal('驳回收款（整组'+batchRecords.length+'单）',body,function(){
    var f=getFormData('reject-batch-pay-form');
    if(!f.rejectReason){toast('请输入驳回原因','error');return}
    for(var ri=0;ri<batchRecords.length;ri++){
      var br=batchRecords[ri];
      br.rec.prej=f.rejectReason;
      br.rec.prej_time=todayStr()+' '+new Date().toTimeString().substr(0,5);
      br.rec.prej_user=curUser.name;
      // 回退子订单的收款相关字段
      var hasConfirmedPay=(br.it.pr_records||[]).some(function(r){return r.pf;});
      if(!hasConfirmedPay){
        br.it.pm=0;br.it.pd='';br.it.pa='';br.it.ppm='';
        br.it.itemStatus='draft';
      }
    }
    syncAll();
    renderOrdersTable();
    renderApprovalPage();
    addNotification('收款被驳回: 共'+batchRecords.length+'单','error');
    toast('收款已驳回（共'+batchRecords.length+'单）');
    closeAllModals();
  });
}

// 按批次整组驳回已通过的收款记录（管理员/财务专用）
function rejectDonePayBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  var batchRecords=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.pr_records)continue;
      for(var rj=0;rj<it.pr_records.length;rj++){
        var rec=it.pr_records[rj];
        if(rec.batchId===batchId&&rec.pf&&!rec.prej){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的已通过记录','error');return;}
  var body='<form id="reject-done-pay-form"><div class="form-group"><label>驳回原因</label><textarea name="rejectReason" rows="3" placeholder="请输入驳回原因" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;resize:vertical"></textarea></div></form>';
  showModal('驳回过期收款（整组'+batchRecords.length+'单）',body,function(){
    var f=getFormData('reject-done-pay-form');
    if(!f.rejectReason){toast('请输入驳回原因','error');return}
    for(var ri=0;ri<batchRecords.length;ri++){
      var br=batchRecords[ri];
      br.rec.prej=f.rejectReason;
      br.rec.prej_time=todayStr()+' '+new Date().toTimeString().substr(0,5);
      // 清除确认信息
      br.rec.pf='';br.rec.pf_actual='';br.rec.pf_amount='';br.rec.pf_account='';br.rec.pf_rk='';
      // 回退子订单的收款字段
      var hasOtherPay=(br.it.pr_records||[]).some(function(r){return r!==br.rec&&!r.prej;});
      if(!hasOtherPay){
        br.it.pm=0;br.it.pd='';br.it.pa='';br.it.ppm='';
        br.it.itemStatus='draft';
      }
    }
    syncAll();renderOrdersTable();renderApprovalPage();
    addNotification('已通过收款被驳回: 共'+batchRecords.length+'单','warning');
    toast('已通过收款已驳回（共'+batchRecords.length+'单）');
    closeAllModals();
  });
}

// 按批次整组确认支出（参照 approvePayBatch）
function approveExpBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  var batchRecords=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.xr)continue;
      for(var rj=0;rj<it.xr.length;rj++){
        var rec=it.xr[rj];
        if(rec.batchId===batchId&&!rec.xf&&!rec.xrej){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的待审批支出','error');return;}
  var totalAmt=0;
  for(var ti=0;ti<batchRecords.length;ti++) totalAmt+=(batchRecords[ti].rec.xm||0);
  totalAmt=Math.round(totalAmt*100)/100;
  var firstRec2=batchRecords[0].rec;
  var expMethodMap={wechat:'微信二维码',alipay_qr:'支付宝二维码',alipay_account:'支付宝账号',bank:'对公账号'};
  var payDetail2={};
  try{payDetail2=firstRec2.xb?JSON.parse(firstRec2.xb):{};}catch(e){payDetail2={};}
  var expMethodText=expMethodMap[firstRec2.xp]||firstRec2.xp||'-';
  var expAccountText='';
  if(firstRec2.xp==='alipay_account'){
    expAccountText=(payDetail2.alipayAccount||'')+' '+(payDetail2.alipayName||'');
  }else if(firstRec2.xp==='bank'){
    expAccountText=(payDetail2.bankName||'')+' '+(payDetail2.bankAccount||'');
  }else{
    expAccountText=firstRec2.xa||'系统默认';
  }
  var appInfo='<div style="background:#fff7e6;padding:10px;border-radius:6px;margin-bottom:12px;font-size:12px;line-height:1.6">'
    +'<div style="font-weight:600;color:#d97706;margin-bottom:6px">📋 申请人提交信息</div>'
    +'<span>申请金额：<b>'+fmtM(totalAmt)+'</b></span><br/>'
    +'<span>支出方式：<b>'+esc(expMethodText)+'</b></span><br/>'
    +'<span>支出账号：<b>'+esc(expAccountText)+'</b></span><br/>'
    +(firstRec2.rk?'<span>备注：<b style="color:#6b7280">'+esc(firstRec2.rk)+'</b></span>':'')
    +'</div>';
  var body=appInfo+'<form id="approve-batch-exp-form"><div class="form-grid">'
    +'<div class="form-group"><label>确认支出时间</label><input type="date" name="confirmDate" value="'+todayStr()+'"/></div>'
    +'<div class="form-group"><label>确认支出总金额</label><input type="number" name="confirmAmount" value="'+totalAmt.toFixed(2)+'" placeholder="请输入确认金额"/></div>'
    +'</div><div class="form-group" style="margin-top:8px"><label>支出账号</label><input name="expAccount" placeholder="实际支出账号"/></div>'
    +'<div class="form-group" style="margin-top:8px"><label>上传审批凭证</label><input type="file" id="approve-batch-exp-img" accept="image/*" multiple onchange="previewExpImg(this)" style="font-size:13px"/><div id="exp-img-preview-replace" style="display:none;margin-top:8px"></div></div>'
    +'</form>';
  showModal('确认支出（整组'+batchRecords.length+'单）',body,function(){
    var f=getFormData('approve-batch-exp-form');
    if(!f.confirmAmount||f.confirmAmount<=0){toast('请输入支出金额','error');return}
    var confirmTotal=parseFloat(f.confirmAmount)||0;
    // 先上传截图再保存
    var pendingExpImgs=_pendingImgFiles['approve-batch-exp-img']||[];
    var doConfirmBatchExp=function(xiVal){
    for(var ai=0;ai<batchRecords.length;ai++){
      var br=batchRecords[ai];
      var ratio=(br.rec.xm||0)/totalAmt;
      var confirmAmt=Math.round(confirmTotal*ratio*100)/100;
      br.rec.xf=todayStr();
      br.rec.xf_time=todayStr()+' '+new Date().toTimeString().substr(0,5);
      br.rec.xm_actual=confirmAmt;
      br.rec.xa_actual=f.expAccount||br.rec.xa||'';
      br.rec.xi_voucher=xiVal; // 保存审批凭证到独立字段
      br.rec.xf_user=curUser.name;
      // 同步更新子订单字段
      br.it.xm=confirmAmt;
      br.it.itemStatus='approved';
      // 重算收益
      br.it.profit=(br.it.pm||0)-(br.it.xm||0)-(br.it.cost||0);
    }
    sumOrder(o);
    syncAll();
    renderOrdersTable();
    renderApprovalPage();
    addNotification('支出确认: 共'+batchRecords.length+'单','success');
    toast('支出已确认（共'+batchRecords.length+'单，¥'+confirmTotal.toFixed(2)+'）');
    closeAllModals();
    };
    if(pendingExpImgs.length){
      uploadMultipleImages(pendingExpImgs).then(function(urls){
        delete _pendingImgFiles['approve-batch-exp-img'];
        doConfirmBatchExp(makeImgUrls(urls));
      }).catch(function(e){console.error('截图上传失败:',e);doConfirmBatchExp('');});
    }else{
      doConfirmBatchExp('');
    }
  });
}

// 按批次整组驳回支出
function rejectExpBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  var batchRecords=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.xr)continue;
      for(var rj=0;rj<it.xr.length;rj++){
        var rec=it.xr[rj];
        if(rec.batchId===batchId&&!rec.xf&&!rec.xrej){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的待审批支出','error');return;}
  var body='<form id="reject-batch-exp-form"><div class="form-group"><label>驳回原因</label><textarea name="rejectReason" rows="3" placeholder="请输入驳回原因" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;resize:vertical"></textarea></div></form>';
  showModal('驳回支出（整组'+batchRecords.length+'单）',body,function(){
    var f=getFormData('reject-batch-exp-form');
    if(!f.rejectReason){toast('请输入驳回原因','error');return}
    for(var ri=0;ri<batchRecords.length;ri++){
      var br=batchRecords[ri];
      br.rec.xrej=f.rejectReason;
      br.rec.xrej_time=todayStr()+' '+new Date().toTimeString().substr(0,5);
      br.rec.xrej_user=curUser.name;
      var hasConfirmedExp=(br.it.xr||[]).some(function(r){return r.xf;});
      if(!hasConfirmedExp){
        br.it.xm=0;br.it.xd='';br.it.xp='';
        br.it.itemStatus='draft';
      }
    }
    syncAll();
    renderOrdersTable();
    renderApprovalPage();
    addNotification('支出被驳回: 共'+batchRecords.length+'单','error');
    toast('支出已驳回（共'+batchRecords.length+'单）');
    closeAllModals();
  });
}

// 按批次整组驳回已通过的支出记录（管理员/财务专用）
function rejectDoneExpBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  var batchRecords=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.xr)continue;
      for(var rj=0;rj<it.xr.length;rj++){
        var rec=it.xr[rj];
        if(rec.batchId===batchId&&rec.xf&&!rec.xrej){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的已通过支出','error');return;}
  var body='<form id="reject-done-exp-form"><div class="form-group"><label>驳回原因</label><textarea name="rejectReason" rows="3" placeholder="请输入驳回原因" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;resize:vertical"></textarea></div></form>';
  showModal('驳回已通过支出（整组'+batchRecords.length+'单）',body,function(){
    var f=getFormData('reject-done-exp-form');
    if(!f.rejectReason){toast('请输入驳回原因','error');return}
    for(var ri=0;ri<batchRecords.length;ri++){
      var br=batchRecords[ri];
      br.rec.xrej=f.rejectReason;
      br.rec.xrej_time=todayStr()+' '+new Date().toTimeString().substr(0,5);
      // 清除确认信息
      br.rec.xf='';br.rec.xf_time='';br.rec.xm_actual='';br.rec.xa_actual='';br.rec.xi='';
      var hasOtherExp=(br.it.xr||[]).some(function(r){return r!==br.rec&&!r.xrej;});
      if(!hasOtherExp){
        br.it.xm=0;br.it.xd='';br.it.xp='';
        br.it.itemStatus='draft';
      }
    }
    syncAll();renderOrdersTable();renderApprovalPage();
    addNotification('已通过支出被驳回: 共'+batchRecords.length+'单','warning');
    toast('已通过支出已驳回（共'+batchRecords.length+'单）');
    closeAllModals();
  });
}

function approvePay(oid,idx,recIdx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  var rec=null;
  if(idx===-1){
    // 母订单收款
    rec=o.pr&&o.pr[recIdx];
  } else {
    // 子订单收款
    if(!o.items||!o.items[idx]){toast('子订单不存在','error');return;}
    var it=o.items[idx];
    rec=(it.pr_records||it.pr||[])[recIdx];
  }
  if(!rec){toast('收款记录不存在','error');return;}
  var body='<form id="approve-pay-form"><div class="form-grid">'
    +'<div class="form-group"><label>确认收款时间</label><input type="date" name="confirmDate" value="'+todayStr()+'"/></div>'
    +'<div class="form-group"><label>确认收款金额</label><input type="number" name="confirmAmount" value="'+(rec.pm||0)+'" placeholder="请输入确认金额"/></div>'
    +'</div><div class="form-group" style="margin-top:8px"><label>确认备注</label><input name="confirmRemark" placeholder="可选，填写确认收款备注"/></div></form>';
  showModal('确认收款',body,function(){
    var f=getFormData('approve-pay-form');
    if(!f.confirmAmount||f.confirmAmount<=0){toast('请输入收款金额','error');return}
    // 更新收款记录状态为已确认
    rec.pf=todayStr(); // 确认时间
    rec.pf_actual=f.confirmDate; // 实际确认日期
    rec.pf_amount=parseFloat(f.confirmAmount)||0; // 实际确认金额
    rec.pf_rk=f.confirmRemark||''; // 确认备注
    // 如果是子订单收款，同步更新子订单字段并改为已通过
    if(idx!==-1&&o.items&&o.items[idx]){
      var aIt=o.items[idx];
      aIt.pm=rec.pf_amount;
      aIt.pd=rec.pf_actual;
      aIt.ppm=rec.ppm;
      aIt.pa=rec.ppa;
      aIt.itemStatus='approved';
      aIt.profit=(aIt.pm||0)-(aIt.xm||0)-(aIt.cost||0);
      // 付款后同步更新地址（所有业务类型）
      syncSubOrderToAddress(aIt, o);
    }
    sumOrder(o);
    syncAll();
    updateParentOrderStatus(o);
    renderOrdersTable();
    renderApprovalPage();
    toast('收款已确认');
    closeAllModals();
  });
}

// 驳回收款审批
function rejectPay(oid,idx,recIdx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  var rec=null;
  if(idx===-1){
    rec=o.pr&&o.pr[recIdx];
  } else {
    if(!o.items||!o.items[idx]){toast('子订单不存在','error');return;}
    var it=o.items[idx];
    rec=(it.pr_records||it.pr||[])[recIdx];
  }
  if(!rec){toast('收款记录不存在','error');return;}
  var body='<form id="reject-pay-form"><div class="form-group"><label>驳回原因</label><textarea name="rejectReason" rows="3" placeholder="请输入驳回原因" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:4px;resize:vertical"></textarea></div></form>';
  showModal('驳回收款',body,function(){
    var f=getFormData('reject-pay-form');
    if(!f.rejectReason){toast('请输入驳回原因','error');return}
    rec.prej=f.rejectReason; // 驳回原因
    // 如果该记录已被确认（已通过），同时清除确认信息
    if(rec.pf){rec.pf='';rec.pf_actual='';rec.pf_amount='';rec.pf_account='';rec.pf_rk='';}
    // 驳回后回退子订单的收款相关字段
    if(idx!==-1&&o.items&&o.items[idx]){
      var rIt=o.items[idx];
      // 检查是否还有其他已确认的收款记录
      var hasConfirmedPay=(rIt.pr_records||[]).some(function(r){return r.pf;});
      var hasOtherPay=(rIt.pr_records||[]).length>0;
      if(!hasConfirmedPay){
        rIt.pm=0;rIt.pd='';rIt.pa='';rIt.ppm='';
        rIt.itemStatus='draft';
      }
    }
    updateParentOrderStatus(o);
    syncAll();
    renderOrdersTable();
    renderApprovalPage();
    toast('收款已驳回');
    closeAllModals();
  });
}

// 撤回收款申请（业务员自己撤回）
// callback: 撤回成功后调用的回调（用于刷新弹窗内的待审批区域）
function withdrawPay(oid,idx,recIdx,callback){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  var rec=null;
  var it=null;
  if(idx===-1){
    rec=o.pr&&o.pr[recIdx];
  } else {
    if(!o.items||!o.items[idx]){toast('子订单不存在','error');return;}
    it=o.items[idx];
    // 统一使用pr_records数组
    rec=(it.pr_records||[])[recIdx];
  }
  if(!rec){toast('收款记录不存在','error');return;}
  if(rec.pf){toast('已确认的收款不能撤回','error');return;}
  if(rec.prej){toast('已驳回的收款不能撤回','error');return;}
  // 确认撤回
  confirmDialog('确定要撤回这笔收款申请吗？撤回后订单的收款信息将回退。',function(){
    // 从pr_records中移除该记录
    if(idx===-1){
      if(o.pr)o.pr.splice(recIdx,1);
    } else {
      if(it&&it.pr_records)it.pr_records.splice(recIdx,1);
      // 回退子订单的收款相关字段
      var hasConfirmedPay=(it&&it.pr_records||[]).some(function(r){return r.pf;});
      var hasOtherPay=(it&&it.pr_records||[]).length>0;
      if(!hasOtherPay){
        it.pm=0;
        it.pd='';
        it.pa='';
        it.ppm='';
        it.itemStatus='draft';
      }else if(!hasConfirmedPay){
        var lastRec=it.pr_records[it.pr_records.length-1];
        if(lastRec){
          it.pm=lastRec.pm||0;
          it.pd=lastRec.pd||'';
          it.pa=lastRec.ppa||'';
          it.ppm=lastRec.ppm||'';
        }
      }
    }
    updateParentOrderStatus(o);
    syncAll();
    // 如果有回调，先调用回调刷新弹窗内容
    if(callback && typeof callback==='function'){
      callback();
    }
    if(curPage==='approval'){renderApprovalPage();}
    else if(curPage==='orders'){renderOrdersTable();}
    updateApprovalBadge();
    toast('收款申请已撤回');
  });
}

// 按批次整组修改收款记录
// 修改收款申请（整组）- 允许编辑已驳回记录
function editPayBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 判断是否为无 batchId 的老数据的虚拟 key
  var isNoBatch = batchId && (batchId.indexOf('__noBatch_')===0 || batchId.indexOf('__no_')===0);
  var nbSubIdx = -1, nbRecIdx = -1;
  if(isNoBatch){
    var parts = batchId.split('_');
    nbSubIdx = parseInt(parts[parts.length-2]);
    nbRecIdx = parseInt(parts[parts.length-1]);
  }
  // 收集同一 batchId 的所有记录（包含已通过、已驳回、未审批）
  var batchRecords=[];
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.pr_records)continue;
      for(var rj=0;rj<it.pr_records.length;rj++){
        var rec=it.pr_records[rj];
        var match = rec.batchId===batchId;
        if(!match && isNoBatch){match = (i===nbSubIdx && rj===nbRecIdx);}
        if(match){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的记录','error');return;}
  var firstRec=batchRecords[0].rec;
  var totalAmt=0;
  for(var ti=0;ti<batchRecords.length;ti++) totalAmt+=(batchRecords[ti].rec.pm||0);
  totalAmt=Math.round(totalAmt*100)/100;
  var payMethod=firstRec.ppm||'';
  var payImg=firstRec.pxi||'';
  var payBatchGid='payBatch_'+oid+'_'+batchId;
  window._editImgData=window._editImgData||{};
  window._editImgData[payBatchGid]=payImg;
  // 构建子订单金额编辑表
  var subEditHtml='<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">';
  subEditHtml+='<thead><tr style="background:#f3f4f6"><th style="padding:6px 8px;text-align:left">子订单</th><th style="padding:6px 8px;text-align:right">金额</th></tr></thead><tbody>';
  for(var si=0;si<batchRecords.length;si++){
    var br=batchRecords[si];
    var subBn=br.it.subBn||('子'+br.subIdx);
    subEditHtml+='<tr style="border-top:1px solid #f3f4f6">';
    subEditHtml+='<td style="padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="tag-gray">'+esc(subBn)+'</span></td>';
    subEditHtml+='<td style="padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(br.it.co||'')+'">'+esc(br.it.co||'-')+'</td>';
    subEditHtml+='<td style="padding:6px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(br.it.addr||'')+'">'+esc(br.it.addr||'-')+'</td>';
    subEditHtml+='<td style="padding:6px 8px;text-align:right"><input type="number" id="edit-batch-amt-'+si+'" value="'+(br.rec.pm||0).toFixed(2)+'" style="width:100px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;text-align:right"/></td>';
    subEditHtml+='</tr>';
  }
  subEditHtml+='</tbody></table>';
  var body='<form id="edit-batch-pay-form"><div class="form-grid">'
    +'<div class="form-group"><label>收款时间</label><input type="date" name="payDate" value="'+(firstRec.pd||todayStr())+'"/></div>'
    +'<div class="form-group"><label>收款总金额</label><input type="number" name="totalAmount" id="edit-batch-total" value="'+totalAmt.toFixed(2)+'" oninput="onEditBatchTotalChange('+batchRecords.length+')"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>收款方式</label><select name="payMethod">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="scan"'+(payMethod==='scan'?' selected':'')+'>扫码</option>'
    +'<option value="bank"'+(payMethod==='bank'?' selected':'')+'>对公</option>'
    +'</select></div>'
    +'<div class="form-group"><label>收款账号</label>'+buildPayAccountOpts(o.sl,firstRec.ppa||'','payAccount')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>各子订单金额（总金额变更时自动平均分配）</label>'+subEditHtml+'</div>'
    +'<div class="form-group full"><label>凭证截图</label>'
    +'<input type="file" id="edit-batch-img-input" accept="image/*" multiple onchange="previewPayImg(this)"/>'
    +'<div id="edit-pay-img-preview"' +(payImg?'':' style="display:none"')+'>'+(payImg?renderImgThumbs(payImg,'width:80px;height:80px;object-fit:cover;border-radius:4px;margin:3px;border:1px solid #e2e8f0;cursor:pointer;','',true,payBatchGid):'')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>备注</label><input name="remark" value="'+esc(firstRec.px||firstRec.pr_rk||'')+'" placeholder="请输入备注"/></div>'
    +'</form>';
  showModal('修改收款申请（整组'+batchRecords.length+'单）',body,function(){
    var f=getFormData('edit-batch-pay-form');
    var newTotal=parseFloat(f.totalAmount)||0;
    if(newTotal<=0){toast('请输入收款总金额','error');return;}
    // 收集各子订单金额
    var newAmounts=[];
    var actualTotal=0;
    for(var ai=0;ai<batchRecords.length;ai++){
      var amt=parseFloat(document.getElementById('edit-batch-amt-'+ai).value)||0;
      newAmounts.push(amt);
      actualTotal+=amt;
    }
    actualTotal=Math.round(actualTotal*100)/100;
    if(Math.abs(actualTotal-newTotal)>0.01){
      toast('各子订单金额总和必须等于总金额（差¥'+(actualTotal-newTotal).toFixed(2)+'）','error');return;
    }
    var pendingFiles=_pendingImgFiles['edit-batch-img-input']||[];
    var doSave=function(imgUrls){
    // 空数组 = 用户删除了所有截图，保存空字符串
    // 数组有值 = 合并后的截图URL，生成JSON字符串保存
    var imgUrl=imgUrls!=null&&imgUrls.length?makeImgUrls(imgUrls):(imgUrls!=null?'':null);
    // 更新所有记录
    for(var ui=0;ui<batchRecords.length;ui++){
      var br2=batchRecords[ui];
      br2.rec.ppm=f.payMethod;
      br2.rec.ppa=f.payAccount;
      br2.rec.pm=newAmounts[ui];
      br2.rec.pd=f.payDate;
      br2.rec.pxi=imgUrl!=null?imgUrl:br2.rec.pxi;
      br2.rec.px=f.remark||'';
      br2.rec.pr_rk=f.remark||'';
      // 如果是已驳回记录重新提交，清除驳回标记
      if(br2.rec.prej){br2.rec.prej='';br2.rec.prej_time='';}
      // 已审批通过的记录，修改后重置为待审批
      if(br2.rec.pf){br2.rec.pf='';br2.rec.pf_user='';br2.rec.pf_actual='';br2.rec.pf_amount='';br2.rec.pf_account='';br2.rec.pf_rk='';br2.rec.pf_time='';}
      // 同步更新子订单字段
      br2.it.pm=newAmounts[ui];
      br2.it.pd=f.payDate;
      br2.it.pa=f.payAccount;
      br2.it.ppm=f.payMethod;
    }
    syncAll();
    delete _pendingImgFiles['edit-batch-img-input'];
    if(curPage==='approval'){renderApprovalPage();}
    else if(curPage==='orders'){renderOrdersTable();}
    updateApprovalBadge();
    toast('收款记录已修改');
    refreshPayModalOnClose(oid);
    closeModal();
    };
    
    if(pendingFiles.length){
      uploadMultipleImages(pendingFiles).then(function(urls){
        var existingUrls=parseImgUrls(window._editImgData[payBatchGid]||"");
        var mergedUrls=existingUrls.concat(urls);
        doSave(mergedUrls);
      }).catch(function(e){console.error('上传失败:',e);doSave(parseImgUrls(window._editImgData[payBatchGid]||""));});
    }else{
      doSave(parseImgUrls(window._editImgData[payBatchGid]||""));  // 没上传新图时传入已删减的现有截图
    }
  });
}

// 编辑批次总金额变化时，重新平均分配
function onEditBatchTotalChange(count){
  var total=parseFloat(document.getElementById('edit-batch-total').value)||0;
  var avg=Math.round(total/count*100)/100;
  for(var i=0;i<count;i++){
    var input=document.getElementById('edit-batch-amt-'+i);
    if(input)input.value=avg.toFixed(2);
  }
}

// 修改已驳回的收款记录（整组操作，修改后重新提交审批）
function editRejectedPayBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 收集同一 batchId 的已驳回记录
  var batchRecords=[];
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.pr_records)continue;
      for(var rj=0;rj<it.pr_records.length;rj++){
        var rec=it.pr_records[rj];
        if(rec.batchId===batchId&&rec.prej&&!rec.pf){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的已驳回记录','error');return;}
  var firstRec=batchRecords[0].rec;
  var totalAmt=0;
  for(var ti=0;ti<batchRecords.length;ti++) totalAmt+=(batchRecords[ti].rec.pm||0);
  totalAmt=Math.round(totalAmt*100)/100;
  var payMethod=firstRec.ppm||'';
  var payImg=firstRec.pxi||'';
  var payBatchGid='payBatch_'+oid+'_'+batchId;
  window._editImgData=window._editImgData||{};
  window._editImgData[payBatchGid]=payImg;
  // 构建子订单金额编辑表
  var subEditHtml='<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">';
  subEditHtml+='<thead><tr style="background:#f3f4f6"><th style="padding:6px 8px;text-align:left">子订单</th><th style="padding:6px 8px;text-align:right">金额</th></tr></thead><tbody>';
  for(var si=0;si<batchRecords.length;si++){
    var br=batchRecords[si];
    var subBn=br.it.subBn||('子'+br.subIdx);
    subEditHtml+='<tr style="border-top:1px solid #f3f4f6">';
    subEditHtml+='<td style="padding:6px 8px">'+esc(subBn)+'</td>';
    subEditHtml+='<td style="padding:6px 8px;text-align:right"><input type="number" id="edit-rejected-amt-'+si+'" value="'+(br.rec.pm||0).toFixed(2)+'" style="width:100px;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;text-align:right"/></td>';
    subEditHtml+='</tr>';
  }
  subEditHtml+='</tbody></table>';
  var body='<form id="edit-rejected-pay-form"><div class="form-grid">'
    +'<div class="form-group"><label>收款时间</label><input type="date" name="payDate" value="'+(firstRec.pd||todayStr())+'"/></div>'
    +'<div class="form-group"><label>收款总金额</label><input type="number" name="totalAmount" id="edit-rejected-total" value="'+totalAmt.toFixed(2)+'" oninput="onEditRejectedTotalChange('+batchRecords.length+')"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>收款方式</label><select name="payMethod">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="scan"'+(payMethod==='scan'?' selected':'')+'>扫码</option>'
    +'<option value="bank"'+(payMethod==='bank'?' selected':'')+'>对公</option>'
    +'</select></div>'
    +'<div class="form-group"><label>收款账号</label>'+buildPayAccountOpts(o.sl,firstRec.ppa||'','payAccount')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>各子订单金额（总金额变更时自动平均分配）</label>'+subEditHtml+'</div>'
    +'<div class="form-group full"><label>凭证截图</label>'
    +'<input type="file" id="edit-rejected-img-input" accept="image/*" multiple onchange="previewPayImg(this)"/>'
    +'<div id="edit-rejected-img-preview"' +(payImg?'':' style="display:none"')+'>'+(payImg?renderImgThumbs(payImg,'width:80px;height:80px;object-fit:cover;border-radius:4px;margin:3px;border:1px solid #e2e8f0;cursor:pointer;','',true,payBatchGid):'')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>备注</label><input name="remark" value="'+esc(firstRec.px||firstRec.pr_rk||'')+'" placeholder="请输入备注"/></div>'
    +'</form>';
  showModal('修改已驳回收款（整组'+batchRecords.length+'单，修改后重新提交审批）',body,function(){
    var f=getFormData('edit-rejected-pay-form');
    var newTotal=parseFloat(f.totalAmount)||0;
    if(newTotal<=0){toast('请输入收款总金额','error');return;}
    // 收集各子订单金额
    var newAmounts=[];
    var actualTotal=0;
    for(var ai=0;ai<batchRecords.length;ai++){
      var amt=parseFloat(document.getElementById('edit-rejected-amt-'+ai).value)||0;
      newAmounts.push(amt);
      actualTotal+=amt;
    }
    actualTotal=Math.round(actualTotal*100)/100;
    if(Math.abs(actualTotal-newTotal)>0.01){
      toast('各子订单金额总和必须等于总金额（差¥'+(actualTotal-newTotal).toFixed(2)+'）','error');return;
    }
    var pendingFiles=_pendingImgFiles['edit-rejected-img-input']||[];
    var doSave=function(imgUrls){
    // 空数组 = 用户删除了所有截图，保存空字符串
    var imgUrl=imgUrls!=null&&imgUrls.length?makeImgUrls(imgUrls):(imgUrls!=null?'':null);
    // 更新所有记录：清除驳回状态，重新提交审批
    for(var ui=0;ui<batchRecords.length;ui++){
      var br2=batchRecords[ui];
      br2.rec.ppm=f.payMethod;
      br2.rec.ppa=f.payAccount;
      br2.rec.pm=newAmounts[ui];
      br2.rec.pd=f.payDate;
      br2.rec.pxi=imgUrl!=null?imgUrl:br2.rec.pxi;
      br2.rec.px=f.remark||'';
      br2.rec.pr_rk=f.remark||'';
      br2.rec.prej='';          // 清除驳回原因
      br2.rec.prej_time='';     // 清除驳回时间
      br2.rec.pf_actual='';     // 清除审批时间
      // 同步更新子订单字段
      br2.it.pm=newAmounts[ui];
      br2.it.pd=f.payDate;
      br2.it.pa=f.payAccount;
      br2.it.ppm=f.payMethod;
    }
    syncAll();
    delete _pendingImgFiles['edit-rejected-img-input'];
    if(curPage==='approval'){renderApprovalPage();}
    else if(curPage==='orders'){renderOrdersTable();}
    updateApprovalBadge();
    toast('已驳回记录已修改，重新提交审批');
    refreshPayModalOnClose(oid);
    closeModal();
    };
    
    if(pendingFiles.length){
      uploadMultipleImages(pendingFiles).then(function(urls){
        var existingUrls=parseImgUrls(window._editImgData[payBatchGid]||"");
        var mergedUrls=existingUrls.concat(urls);
        doSave(mergedUrls);
      }).catch(function(e){console.error('上传失败:',e);doSave(parseImgUrls(window._editImgData[payBatchGid]||""));});
    }else{
      doSave(parseImgUrls(window._editImgData[payBatchGid]||""));
    }
  });
}
// ========== 支出记录编辑函数 ==========
// 编辑单条支出记录（含已驳回记录）- 匹配原始支出申请表单样式
function editExpRecord(oid, subIdx, recIdx){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  if(!o.items||!o.items[subIdx]){toast('子订单不存在','error');return;}
  var it=o.items[subIdx];
  if(!it.xr||!it.xr[recIdx]){toast('支出记录不存在','error');return;}
  var rec=it.xr[recIdx];
  var isApproved=!!rec.xf;
  var expMethod=rec.xp||'';
  var paymentDetail={};
  try{paymentDetail=rec.xb?JSON.parse(rec.xb):{};}catch(e){paymentDetail={};}
  var expImg=rec.xi||'';
  var expEditGid='expEdit_'+oid+'_'+subIdx+'_'+recIdx;
  window._editImgData=window._editImgData||{};
  window._editImgData[expEditGid]=expImg;
  var rejectedBadge='';
  if(rec.xrej) rejectedBadge='<div style="background:#fef2f2;padding:6px 12px;border-radius:4px;margin-bottom:12px;font-size:12px;color:#dc2626"><b>❌ 已驳回</b> - '+esc(rec.xrej)+'</div>';
  var alipayInfoDisplay=expMethod==='alipay_account'?'':'display:none';
  var bankInfoDisplay=expMethod==='bank'?'':'display:none';
  var imgUploadDisplay=(expMethod==='wechat'||expMethod==='alipay_qr')?'':'display:none';
  var body=rejectedBadge+'<form id="edit-exp-form"><div class="form-grid">'
    +'<div class="form-group"><label>子订单编号</label><input value="'+esc(it.subBn||'')+'" disabled style="background:#f5f5f5"/></div>'
    +'<div class="form-group"><label>申请时间</label><input type="date" name="expDate" value="'+(rec.xd||todayStr())+'"/></div>'
    +'<div class="form-group"><label>支出对象</label><input name="payee" value="'+esc(rec.payee||'')+'" placeholder="请输入收款方"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>支出金额</label><input type="number" name="expAmount" value="'+(rec.xm||0)+'" placeholder="请输入支出金额"/></div>'
    +'<div class="form-group"><label>支付方式</label><select name="expMethod" id="edit-exp-method-select" onchange="toggleBankInfo(this.value)">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="wechat"'+(expMethod==='wechat'?' selected':'')+'>微信二维码</option>'
    +'<option value="alipay_qr"'+(expMethod==='alipay_qr'?' selected':'')+'>支付宝二维码</option>'
    +'<option value="alipay_account"'+(expMethod==='alipay_account'?' selected':'')+'>支付宝账号</option>'
    +'<option value="bank"'+(expMethod==='bank'?' selected':'')+'>对公账号</option>'
    +'</select></div>'
    +'</div>'
    // 支付宝账号信息
    +'<div id="edit-alipay-account-info" class="form-grid" style="'+alipayInfoDisplay+'">'
    +'<div class="form-group"><label>支付宝账号</label><input type="text" name="alipayAccount" value="'+(paymentDetail.alipayAccount||'')+'" placeholder="账号"/></div>'
    +'<div class="form-group"><label>支付宝姓名</label><input type="text" name="alipayName" value="'+(paymentDetail.alipayName||'')+'" placeholder="姓名"/></div>'
    +'</div>'
    // 对公账号信息
    +'<div id="edit-bank-info" class="form-grid" style="'+bankInfoDisplay+'">'
    +'<div class="form-group"><label>开户行</label><input type="text" name="bankName" value="'+(paymentDetail.bankName||'')+'" placeholder="如：工商银行深圳分行"/></div>'
    +'<div class="form-group"><label>对公账号</label><input type="text" name="bankAccount" value="'+(paymentDetail.bankAccount||'')+'" placeholder="账号"/></div>'
    +'<div class="form-group"><label>账户名称</label><input type="text" name="bankHolder" value="'+(paymentDetail.bankHolder||'')+'" placeholder="账户名称"/></div>'
    +'</div>'
    // 二维码/截图上传
    +'<div id="edit-exp-img-upload"'+(imgUploadDisplay==='display:none'?' style="display:none"':'')+'>'
    +'<div class="form-group full"><label>上传凭证</label>'
    +'<input type="file" id="edit-exp-img-input" accept="image/*" multiple onchange="previewExpImg(this)"/>'
    +'<div id="edit-exp-img-preview"'+(expImg?'':' style="display:none"')+'>'+(expImg?renderImgThumbs(expImg,'width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:pointer;margin:3px;border:1px solid #e2e8f0;','',true,expEditGid):'')+'</div>'
    +'</div></div>'
    +'<div class="form-group full"><label>备注</label><input name="remark" value="'+esc(rec.rk||'')+'" placeholder="请输入备注"/></div>'
    +'</form>';
  showModal('修改支出申请',body,function(){
    var f=getFormData('edit-exp-form');
    if(!f.expAmount||f.expAmount<=0){toast('请输入支出金额','error');return;}
    if(!f.expMethod){toast('请选择支付方式','error');return;}
    var expAmt=parseFloat(f.expAmount)||0;
    // 构建支付详情
    var pDetail={method:f.expMethod};
    if(f.expMethod==='alipay_account'){
      pDetail.alipayAccount=f.alipayAccount;
      pDetail.alipayName=f.alipayName;
    }else if(f.expMethod==='bank'){
      pDetail.bankName=f.bankName;
      pDetail.bankAccount=f.bankAccount;
      pDetail.bankHolder=f.bankHolder;
    }
    // 处理图片上传
    var pendingExpImgs=_pendingImgFiles['edit-exp-img-input']||[];
    var doSaveEditExp=function(xiVal){
      var _batchId=rec.batchId||'';
      it.xr[recIdx]={
        batchId:_batchId,
        expNo:rec.expNo||'',
        xd:f.expDate,
        xp:f.expMethod,
        xm:expAmt,
        payee:f.payee||'',
        xb:JSON.stringify(pDetail),
        xi:xiVal,
        rk:f.remark||''
      };
      if(rec.xrej){it.xr[recIdx].xrej='';it.xr[recIdx].xrej_time='';}
      it.xm=expAmt;it.xd=f.expDate;
      it.xp=f.expMethod;
      delete _pendingImgFiles['edit-exp-img-input'];
      syncAll();renderOrdersTable();toast('支出记录已修改');refreshExpModalOnClose(oid);closeModal();
    };
    if(pendingExpImgs.length){
      uploadMultipleImages(pendingExpImgs).then(function(urls){
        var existingUrls=parseImgUrls(window._editImgData[expEditGid]||"");
        var mergedUrls=existingUrls.concat(urls);
        doSaveEditExp(makeImgUrls(mergedUrls));
      }).catch(function(e){console.error('截图上传失败:',e);doSaveEditExp(window._editImgData?window._editImgData[expEditGid]||'':'')});
    }else{
      doSaveEditExp(window._editImgData?window._editImgData[expEditGid]||'':rec.xi||'');
    }
  });
}
// 编辑母订单/批次的支出记录（含已驳回） - 匹配原始支出申请表单样式
function editExpBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast("订单不存在","error");return;}
  var isNoBatch = batchId && (batchId.indexOf("__noBatch_")===0 || batchId.indexOf("__no_")===0);
  var nbSubIdx = -1, nbRecIdx = -1;
  if(isNoBatch){
    var parts = batchId.split("_");
    nbSubIdx = parseInt(parts[parts.length-2]);
    nbRecIdx = parseInt(parts[parts.length-1]);
  }
  var batchRecords=[];
  if(o.items){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];if(!it.xr)continue;
      for(var rj=0;rj<it.xr.length;rj++){
        var rec=it.xr[rj];
        var match = rec.batchId===batchId;
        if(!match && isNoBatch){match = (i===nbSubIdx && rj==nbRecIdx);}
        if(match){ batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it}); }
      }
    }
  }
  if(batchRecords.length===0){toast("未找到该批次的记录","error");return;}
  var firstRec=batchRecords[0].rec;
  var totalAmt=0;
  for(var ti=0;ti<batchRecords.length;ti++) totalAmt+=(batchRecords[ti].rec.xm||0);
  totalAmt=Math.round(totalAmt*100)/100;
  var expMethod=firstRec.xp||"";
  var paymentDetail={};
  try{paymentDetail=firstRec.xb?JSON.parse(firstRec.xb):{};}catch(e){paymentDetail={};}
  var expImg=firstRec.xi||"";
  var expBatchGid='expBatch_'+oid+'_'+batchId;
  window._editImgData=window._editImgData||{};
  window._editImgData[expBatchGid]=expImg;
  var rejectedBadge="";
  if(firstRec.xrej) rejectedBadge='<div style="background:#fef2f2;padding:6px 12px;border-radius:4px;margin-bottom:12px;font-size:12px;color:#dc2626"><b>❌ 已驳回</b> - '+esc(firstRec.xrej)+'</div>';
  var alipayInfoDisplay=expMethod==="alipay_account"?"":"display:none";
  var bankInfoDisplay=expMethod==="bank"?"":"display:none";
  var imgUploadDisplay=(expMethod==="wechat"||expMethod==="alipay_qr")?"":"display:none";
  // Build sub-order table
  var subListHtml='<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;background:#fafafa;border-radius:6px">'
    +'<thead><tr style="background:#f3f4f6"><th style="padding:6px 8px;text-align:left">子订单</th><th style="padding:6px 8px;text-align:left">单位</th><th style="padding:6px 8px;text-align:left">地址</th><th style="padding:6px 8px;text-align:right">金额</th></tr></thead><tbody>';
  for(var si=0;si<batchRecords.length;si++){
    var br=batchRecords[si];
    subListHtml+='<tr style="border-top:1px solid #e5e7eb">';
    subListHtml+='<td style="padding:5px 8px"><span class="tag-gray">'+esc(br.it.subBn||("子"+br.subIdx))+'</span></td>';
    subListHtml+='<td style="padding:5px 8px">'+esc(br.it.co||" - ")+'</td>';
    subListHtml+='<td style="padding:5px 8px">'+esc(br.it.addr||" - ")+'</td>';
    subListHtml+='<td style="padding:5px 8px;text-align:right"><input type="number" id="edit-exp-batch-amt-'+si+'" value="'+(br.rec.xm||0).toFixed(2)+'" style="width:90px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;text-align:right"/></td>';
    subListHtml+="</tr>";
  }
  subListHtml+="</tbody></table>";

  var body=rejectedBadge+'<form id="edit-exp-batch-form"><div class="form-grid">'
    +'<div class="form-group"><label>申请时间</label><input type="date" name="expDate" value="'+(firstRec.xd||todayStr())+'"/></div>'
    +'<div class="form-group"><label>支出总金额</label><input type="number" name="totalAmount" id="edit-exp-batch-total" value="'+totalAmt.toFixed(2)+'" oninput="onEditExpBatchTotalChange('+batchRecords.length+')"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>支出对象</label><input name="payee" value="'+esc(firstRec.payee||"")+'" placeholder="请输入收款方"/></div>'
    +'<div class="form-group"><label>支付方式</label><select name="expMethod" id="edit-batch-exp-method-select" onchange="toggleBankInfo(this.value)">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="wechat"'+(expMethod==="wechat"?" selected":"")+'>微信二维码</option>'
    +'<option value="alipay_qr"'+(expMethod==="alipay_qr"?" selected":"")+'>支付宝二维码</option>'
    +'<option value="alipay_account"'+(expMethod==="alipay_account"?" selected":"")+'>支付宝账号</option>'
    +'<option value="bank"'+(expMethod==="bank"?" selected":"")+'>对公账号</option>'
    +"</select></div>"
    +"</div>"
    +'<div id="edit-batch-alipay-info" class="form-grid" style="'+alipayInfoDisplay+'">'
    +'<div class="form-group"><label>支付宝账号</label><input type="text" name="alipayAccount" value="'+(paymentDetail.alipayAccount||"")+'" placeholder="账号"/></div>'
    +'<div class="form-group"><label>支付宝姓名</label><input type="text" name="alipayName" value="'+(paymentDetail.alipayName||"")+'" placeholder="姓名"/></div>'
    +"</div>"
    +'<div id="edit-bank-batch-info" class="form-grid" style="'+bankInfoDisplay+'">'
    +'<div class="form-group"><label>开户行</label><input type="text" name="bankName" value="'+(paymentDetail.bankName||"")+'" placeholder="如：工商银行深圳分行"/></div>'
    +'<div class="form-group"><label>对公账号</label><input type="text" name="bankAccount" value="'+(paymentDetail.bankAccount||"")+'" placeholder="账号"/></div>'
    +'<div class="form-group"><label>账户名称</label><input type="text" name="bankHolder" value="'+(paymentDetail.bankHolder||"")+'" placeholder="账户名称"/></div>'
    +"</div>"
    +'<div class="form-group full"><label>各子订单金额（总金额变更时自动平均分配）</label>'+subListHtml+'</div>'
    +'<div id="edit-batch-exp-img-upload"'+(imgUploadDisplay==="display:none"?" style=\"display:none\"":"")+'>'
    +'<div class="form-group full"><label>凭证截图</label>'
    +'<input type="file" id="edit-exp-batch-img-input" accept="image/*" multiple onchange="previewExpImg(this)"/>'
    +'<div id="edit-exp-batch-img-preview"'+(expImg?'style="display:block"':'style="display:none"')+'>'+(expImg?renderImgThumbs(expImg,"width:80px;height:80px;object-fit:cover;border-radius:4px;cursor:pointer;margin:3px;border:1px solid #e2e8f0;","",true,expBatchGid):"")+"</div>"
    +"</div></div>"
    +'<div class="form-group full"><label>备注</label><input name="remark" value="'+esc(firstRec.rk||"")+'" placeholder="请输入备注"/></div>'
    +"</form>";
  showModal("修改支出申请（整组"+batchRecords.length+"单）",body,function(){
    var f=getFormData("edit-exp-batch-form");
    var newTotal=parseFloat(f.totalAmount)||0;
    if(newTotal<=0){toast("请输入支出金额","error");return;}
    if(!f.expMethod){toast("请选择支付方式","error");return;}
    var newAmounts=[]; var actualTotal=0;
    for(var ai=0;ai<batchRecords.length;ai++){
      var amt=parseFloat(document.getElementById("edit-exp-batch-amt-"+ai).value)||0;
      newAmounts.push(amt); actualTotal+=amt;
    }
    actualTotal=Math.round(actualTotal*100)/100;
    if(Math.abs(actualTotal-newTotal)>0.01){
      toast("各子订单金额总和必须等于总金额（差￥"+(actualTotal-newTotal).toFixed(2)+"）","error");return;
    }
    var pDetail={method:f.expMethod};
    if(f.expMethod==="alipay_account"){ pDetail.alipayAccount=f.alipayAccount; pDetail.alipayName=f.alipayName; }
    else if(f.expMethod==="bank"){ pDetail.bankName=f.bankName; pDetail.bankAccount=f.bankAccount; pDetail.bankHolder=f.bankHolder; }
    var pendingExpImgs=_pendingImgFiles["edit-exp-batch-img-input"]||[];
    var doSaveBatch=function(xiVal){
      for(var ui=0;ui<batchRecords.length;ui++){
        var br2=batchRecords[ui];
        // 修改现有对象属性而非替换引用，确保数据同步
        br2.rec.xd=f.expDate;
        br2.rec.xp=f.expMethod;
        br2.rec.xm=newAmounts[ui];
        br2.rec.payee=f.payee||"";
        br2.rec.xb=JSON.stringify(pDetail);
        br2.rec.xi=xiVal;
        br2.rec.rk=f.remark||"";
        if(br2.rec.expNo===undefined) br2.rec.expNo=br2.rec.expNo||"";
        if(br2.rec.batchId===undefined) br2.rec.batchId=firstRec.batchId||"";
        if(br2.rec.xrej){br2.rec.xrej="";br2.rec.xrej_time="";}
        // 已审批通过的记录，修改后重置为待审批
        if(br2.rec.xf){br2.rec.xf='';br2.rec.xf_user='';br2.rec.xf_time='';br2.rec.xm_actual='';br2.rec.xa_actual='';br2.rec.xi_voucher='';br2.rec.xf_rk='';}
        br2.it.xm=newAmounts[ui]; br2.it.xd=f.expDate; br2.it.xp=f.expMethod;
      }
      delete _pendingImgFiles["edit-exp-batch-img-input"];
      syncAll();
      if(curPage==="approval")renderApprovalPage(); else if(curPage==="orders")renderOrdersTable();
      toast("支出记录已修改"); refreshExpModalOnClose(oid); closeModal();
    };
    if(pendingExpImgs.length){
      uploadMultipleImages(pendingExpImgs).then(function(urls){
        var existingUrls=parseImgUrls(window._editImgData[expBatchGid]||"");
        var mergedUrls=existingUrls.concat(urls);
        doSaveBatch(makeImgUrls(mergedUrls));
      }).catch(function(e){console.error(e);doSaveBatch(window._editImgData?window._editImgData[expBatchGid]||"":"");});
    }
    else { doSaveBatch(window._editImgData?window._editImgData[expBatchGid]||"":firstRec.xi||""); }
  });
}

function onEditExpBatchTotalChange(count){
  var total=parseFloat(document.getElementById("edit-exp-batch-total").value)||0;
  var avg=Math.round(total/count*100)/100;
  for(var i=0;i<count;i++){ var input=document.getElementById("edit-exp-batch-amt-"+i); if(input) input.value=avg.toFixed(2); }
}

// 修改已驳回批次总金额变化时，重新平均分配
function onEditRejectedTotalChange(count){
  var total=parseFloat(document.getElementById('edit-rejected-total').value)||0;
  var avg=Math.round(total/count*100)/100;
  for(var i=0;i<count;i++){
    var input=document.getElementById('edit-rejected-amt-'+i);
    if(input)input.value=avg.toFixed(2);
  }
}

// 删除已驳回的收款记录（整组操作）
function deleteRejectedPayBatch(batchId, oid){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 收集同一 batchId 的已驳回记录
  var batchRecords=[];
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.pr_records)continue;
      for(var rj=0;rj<it.pr_records.length;rj++){
        var rec=it.pr_records[rj];
        if(rec.batchId===batchId&&rec.prej&&!rec.pf){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的已驳回记录','error');return;}
  confirmDialog('确认删除这组已驳回的收款记录（共'+batchRecords.length+'单）？删除后不可恢复！',function(){
    // 倒序删除记录（避免索引偏移）
    for(var di=batchRecords.length-1;di>=0;di--){
      var br=batchRecords[di];
      var recs=br.it.pr_records;
      if(recs)recs.splice(br.recIdx,1);
    }
    syncAll();
    // 根据当前页面刷新对应视图（而不是固定调 renderOrdersTable）
    if(curPage==='approval'){renderApprovalPage();}
    else if(curPage==='orders'){renderOrdersTable();}
    updateApprovalBadge();
    toast('已驳回记录已删除');
    closeModal();
  });
}

// 按批次整组撤回收款记录
// callback: 撤回成功后调用的回调（用于刷新弹窗内的待审批区域）
function withdrawPayBatch(batchId, oid, callback){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  // 收集同一 batchId 的所有记录
  var batchRecords=[];
  if(o.items&&o.items.length>0){
    for(var i=0;i<o.items.length;i++){
      var it=o.items[i];
      if(!it.pr_records)continue;
      for(var rj=0;rj<it.pr_records.length;rj++){
        var rec=it.pr_records[rj];
        if(rec.batchId===batchId&&!rec.pf){
          batchRecords.push({subIdx:i,recIdx:rj,rec:rec,it:it});
        }
      }
    }
  }
  if(batchRecords.length===0){toast('未找到该批次的待审批记录','error');return;}
  confirmDialog('确定要撤回这组收款申请吗？（共'+batchRecords.length+'单，撤回后收款信息将回退）',function(){
    // 倒序移除，避免索引偏移
    for(var ri=batchRecords.length-1;ri>=0;ri--){
      var br=batchRecords[ri];
      br.it.pr_records.splice(br.recIdx,1);
      // 回退子订单的收款相关字段
      var hasConfirmedPay=(br.it.pr_records||[]).some(function(r){return r.pf;});
      var hasOtherPay=(br.it.pr_records||[]).length>0;
      if(!hasOtherPay){
        br.it.pm=0;br.it.pd='';br.it.pa='';br.it.ppm='';
        br.it.itemStatus='draft';
      }else if(!hasConfirmedPay){
        var lastRec=br.it.pr_records[br.it.pr_records.length-1];
        if(lastRec){
          br.it.pm=lastRec.pm||0;br.it.pd=lastRec.pd||'';
          br.it.pa=lastRec.ppa||'';br.it.ppm=lastRec.ppm||'';
        }
      }
    }
    syncAll();
    // 如果有回调，先调用回调刷新弹窗内容
    if(callback && typeof callback==='function'){
      callback();
    }
    // 根据当前页面刷新对应视图（而不是固定调 renderOrdersTable）
    if(curPage==='approval'){renderApprovalPage();}
    else if(curPage==='orders'){renderOrdersTable();}
    updateApprovalBadge();
    toast('收款申请已撤回（共'+batchRecords.length+'单）');
  });
}

// 生成申请编号：SK/ZX-母订单bn-申请次数
function genPayNo(o, it){
  var prefix='SK-'+(o.bn||'');
  // 统计该子订单下已审批通过的记录数量
  var approvedCount=0;
  var recs=it.pr_records||[];
  for(var pi=0;pi<recs.length;pi++){
    if(recs[pi].pf) approvedCount++;
  }
  return prefix+'-'+String(approvedCount+1).padStart(2,'0');
}
function genExpNo(o, it){
  var prefix='ZC-'+(o.bn||'');
  // 统计该子订单下已审批通过的记录数量
  var approvedCount=0;
  var recs=it.xr||[];
  for(var ei=0;ei<recs.length;ei++){
    if(recs[ei].xf) approvedCount++;
  }
  return prefix+'-'+String(approvedCount+1).padStart(2,'0');
}

// 修改单条收款记录（兼容旧数据，无 batchId 时使用）
// callback: 保存成功后调用的回调（用于刷新待审批列表）
function editPayRecord(oid, subIdx, recIdx, callback){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  if(!o.items||!o.items[subIdx]){toast('子订单不存在','error');return;}
  var it=o.items[subIdx];
  if(!it.pr_records||!it.pr_records[recIdx]){toast('收款记录不存在','error');return;}
  var rec=it.pr_records[recIdx];
  var isApproved=!!rec.pf;

  // 用当前数据预填充表单，复用openPayFromItem的逻辑但替换已有记录
  var payMethod=rec.ppm||'';
  var payImg=rec.pxi||'';
  var payEditGid='payEdit_'+oid+'_'+subIdx+'_'+recIdx;
  window._editImgData=window._editImgData||{};
  window._editImgData[payEditGid]=payImg;
  var body='<form id="edit-pay-item-form"><div class="form-grid">'
    +'<div class="form-group"><label>子订单编号</label><input value="'+esc(it.subBn||'')+'" disabled style="background:#f5f5f5"/></div>'
    +'<div class="form-group"><label>收款时间</label><input type="date" name="payDate" value="'+(rec.pd||todayStr())+'"/></div>'
    +'<div class="form-group"><label>收款金额</label><input type="number" name="payAmount" value="'+(rec.pm||0)+'" placeholder="请输入收款金额"/></div>'
    +'</div><div class="form-grid">'
    +'<div class="form-group"><label>收款方式</label><select name="payMethod">'
    +'<option value="">-- 请选择 --</option>'
    +'<option value="scan"'+(payMethod==='scan'?' selected':'')+'>扫码</option>'
    +'<option value="bank"'+(payMethod==='bank'?' selected':'')+'>对公</option>'
    +'</select></div>'
    +'<div class="form-group"><label>收款账号</label>'+buildPayAccountOpts(o.sl,rec.ppa||'','payAccount')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>凭证截图</label>'
    +'<input type="file" id="edit-pay-img-input" accept="image/*" multiple onchange="previewPayImg(this)"/>'
    +'<div id="edit-pay-img-preview"' +(payImg?'':' style="display:none"')+'>'+(payImg?renderImgThumbs(payImg,'width:80px;height:80px;object-fit:cover;border-radius:4px;margin:3px;border:1px solid #e2e8f0;cursor:pointer;','',true,payEditGid):'')+'</div>'
    +'</div>'
    +'<div class="form-group full"><label>备注</label><input name="remark" value="'+esc(rec.px||rec.pr_rk||'')+'" placeholder="请输入备注"/></div>'
    +'</form>';
    showModal('修改收款申请',body,function(){
    var f=getFormData('edit-pay-item-form');
    if(!f.payAmount||f.payAmount<=0){toast('请输入收款金额','error');return}
    var payAmt=parseFloat(f.payAmount)||0;
    // 处理截图上传（保留原图或替换为新图）
    var pendingPayImgs=_pendingImgFiles['edit-pay-img-input']||[];
    var doSaveEditPay=function(imgUrl){
      var newRec={
        batchId:rec.batchId||'',
        pd:f.payDate,
        pm:payAmt,
        ppm:f.payMethod,
        ppa:f.payAccount,
        pxi:imgUrl,
        px:f.remark||'',
        pr_rk:f.remark||'',
        payNo:rec.payNo||''
      };
      // 如果是驳回记录重新提交，清除驳回标记
      if(rec.prej){newRec.prej='';newRec.prej_time='';}
      it.pr_records[recIdx]=newRec;
      // 同步更新子订单字段
      it.pm=payAmt;it.pd=f.payDate;it.pa=f.payAccount;it.ppm=f.payMethod;
      delete _pendingImgFiles['edit-pay-img-input'];
      syncAll();renderOrdersTable();toast('收款记录已修改');
      refreshPayModalOnClose(oid);closeModal();
    };
    if(pendingPayImgs.length){
      uploadMultipleImages(pendingPayImgs).then(function(urls){
        var existingUrls=parseImgUrls(window._editImgData[payEditGid]||"");
        var mergedUrls=existingUrls.concat(urls);
        doSaveEditPay(makeImgUrls(mergedUrls));
      }).catch(function(e){console.error('截图上传失败:',e);doSaveEditPay(window._editImgData?window._editImgData[payEditGid]||'':'');});
    }else{
      doSaveEditPay(window._editImgData?window._editImgData[payEditGid]||'':rec.pxi||'');
    }
  });
}

// 删除待审批的收款记录
function deletePayRecord(oid, subIdx, recIdx, callback){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o){toast('订单不存在','error');return;}
  if(!o.items||!o.items[subIdx]){toast('子订单不存在','error');return;}
  var it=o.items[subIdx];
  if(!it.pr_records||!it.pr_records[recIdx]){toast('收款记录不存在','error');return;}
  var rec=it.pr_records[recIdx];
  // 已审批通过的记录需要管理员/财务/总经理权限才能删除
  if(rec.pf&&curRole!=='admin'&&curRole!=='finance'&&curRole!=='gm'){
    toast('已审批通过的记录需管理员或财务才能删除','error');return;
  }
  if(rec.prej){toast('已驳回的记录不能删除','error');return;}

  confirmDialog('确定要删除这条收款申请吗？删除后该子订单的收款信息将被清空。', function(){
    // 从pr_records中移除
    it.pr_records.splice(recIdx,1);
    // 回退子订单字段
    var hasConfirmedPay=(it.pr_records||[]).some(function(r){return r.pf;});
    var hasOtherPay=(it.pr_records||[]).length>0;
    if(!hasOtherPay){
      it.pm=0;it.pd='';it.pa='';it.ppm='';
      it.itemStatus='draft';
    }else if(!hasConfirmedPay){
      var lastRec=it.pr_records[it.pr_records.length-1];
      if(lastRec){
        it.pm=lastRec.pm||0;
        it.pd=lastRec.pd||'';
        it.pa=lastRec.ppa||'';
        it.ppm=lastRec.ppm||'';
      }
    }
    // 关键：重新计算订单总金额
    sumOrder(o);
    syncAll();
    // 如果订单详情弹窗是打开的，移除它
    var detailOv2=document.querySelector('.order-detail-overlay');
    if(detailOv2) detailOv2.remove();
    // 如果"选择订单"弹窗是打开的，先关闭再用最新数据重新打开
    var modalOv4=document.getElementById('modal-overlay');
    if(modalOv4 && $('modal-title')&&$('modal-title').textContent==='选择订单'){
      closeModal();
      var _oid3=oid;
      setTimeout(function(){ openPayFromParent(_oid3); },300);
    }else{
      // 弹窗未打开，仅刷新申请记录表格
      refreshPayAppTable(oid);
    }
    // 刷新当前页面
    if(curPage==='approval'){renderApprovalPage();}
    else if(curPage==='orders'){renderOrdersTable();}
    else if(curPage==='performance'){renderPerformance();}
    else if(curPage==='salary'){renderSalaryPage();}
    // 始终刷新数据看板和业绩/工资页面
    renderDashboard();
    updateApprovalBadge();
    toast('收款记录已删除');
  });
}

// 构建待审批收款记录区域HTML
// oid: 母订单ID
// subIndices: 子订单索引数组（null/undefined=所有子订单）
function buildPendingPaySection(oid, subIndices){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o)return '';
  var isAdmin=curUser&&curUser.role==='admin';
  var isFinance=curUser&&curUser.role==='finance';
  var canModify=isAdmin||isFinance||(o.sl===(curUser.name||''));
  var html='<div id="pending-pay-records-section" style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">';
  html+='<div style="background:#fffbeb;padding:8px 12px;font-weight:600;font-size:13px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">';
  html+='<span>📋 待审批收款记录</span>';
  html+='<span id="pending-pay-count" style="background:#f59e0b;color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">0</span>';
  html+='</div>';
  // 收集待审批记录
  var records=[];
  var items=o.items||[];
  var indices;
  if(!subIndices||subIndices.length===0){
    indices=[];
    for(var ni=0;ni<items.length;ni++)indices.push(ni);
  }else{
    indices=subIndices.slice();
  }
  for(var ri=0;ri<indices.length;ri++){
    var idx=indices[ri];
    var it=items[idx];
    if(!it)continue;
    var recs=it.pr_records||[];
    for(var rj=0;rj<recs.length;rj++){
      var rec=recs[rj];
      if(!rec.pf&&!rec.prej){
        records.push({idx:idx,recIdx:rj,rec:rec,it:it});
      }
    }
  }
  // 按 batchId 分组计数
  var batchCount=0;
  if(records.length===0){
    html+='<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">暂无待审批记录</div>';
  }else{
    // 按 batchId 分组
    var groups={};
    var groupOrder=[];
    for(var gi=0;gi<records.length;gi++){
      var r=records[gi];
      var bid=r.rec.batchId||('__noBatch_'+r.idx+'_'+r.recIdx);
      if(!groups[bid]){
        groups[bid]=[];
        groupOrder.push(bid);
      }
      groups[bid].push(r);
    }
    var batchCount=groupOrder.length;
    html+='<div style="max-height:300px;overflow-y:auto">';
    html+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html+='<thead><tr style="background:#f9fafb;position:sticky;top:0">';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">子订单 / 单位</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">编号</th>';
    html+='<th style="padding:5px 8px;text-align:right;font-weight:500">金额</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">时间</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">方式</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">账号</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">凭证</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">备注</th>';
    html+='<th style="padding:5px 8px;text-align:center;font-weight:500">操作</th>';
    html+='</tr></thead><tbody>';
    for(var gk=0;gk<groupOrder.length;gk++){
      var bid=groupOrder[gk];
      var grp=groups[bid];
      var firstRec=grp[0].rec;
      var ppmText=firstRec.ppm==='scan'?'扫码':(firstRec.ppm==='bank'?'对公':(firstRec.ppm||'-'));
      var payAccount=firstRec.ppa||'-';
      var totalAmt=0;
      for(var ti=0;ti<grp.length;ti++) totalAmt+=(grp[ti].rec.pm||0);
      totalAmt=Math.round(totalAmt*100)/100;
      var isMulti=grp.length>1;
      for(var ri2=0;ri2<grp.length;ri2++){
        var r2=grp[ri2];
        var subBn=r2.it.subBn||('子'+r2.idx);
        var coName=r2.it.co||r2.it.company||o.co||'';
        html+='<tr style="border-top:1px solid #f3f4f6">';
        // 子订单列：显示编号 + 单位名称
        var subCell='<div style="font-weight:500">'+esc(subBn)+'</div>';
        if(coName) subCell+='<div style="color:#6b7280;font-size:10px;margin-top:1px">'+esc(coName)+'</div>';
        html+='<td style="padding:5px 8px;overflow:hidden;text-overflow:ellipsis" title="'+esc(subBn)+' - '+esc(coName)+'">'+subCell+'</td>';
        // 编号列：显示申请编号
        html+='<td style="padding:5px 8px;text-align:left;font-size:11px;color:#1d4ed8;'+(isMulti&&ri2===0?'border-bottom:1px dashed #e5e7eb':'')+'" '+(isMulti&&ri2===0?'rowspan="'+grp.length+'"':'')+'>'+(firstRec.payNo?esc(firstRec.payNo):'-')+'</td>';
        // 金额列：第一行显示总金额，其余行显示各子订单金额
        if(ri2===0){
          if(isMulti){
            html+='<td style="padding:5px 8px;text-align:right;color:#059669;font-weight:700;border-bottom:1px dashed #e5e7eb" rowspan="'+grp.length+'">¥'+totalAmt.toFixed(2)+'</td>';
          }else{
            html+='<td style="padding:5px 8px;text-align:right;color:#059669;font-weight:500">¥'+(r2.rec.pm||0).toFixed(2)+'</td>';
          }
        }
        // 时间列：第一行合并
        if(ri2===0){
          html+='<td style="padding:5px 8px;'+(isMulti?'border-bottom:1px dashed #e5e7eb':'')+'" rowspan="'+(isMulti?grp.length:1)+'">'+esc(firstRec.pd||'-')+'</td>';
          html+='<td style="padding:5px 8px;'+(isMulti?'border-bottom:1px dashed #e5e7eb':'')+'" rowspan="'+(isMulti?grp.length:1)+'">'+esc(ppmText)+'</td>';
          html+='<td style="padding:5px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'+(isMulti?'border-bottom:1px dashed #e5e7eb':'')+'" title="'+esc(payAccount)+'" rowspan="'+(isMulti?grp.length:1)+'">'+esc(payAccount)+'</td>';
          // 凭证截图列（合并显示整批次的凭证）
          var payImgData=firstRec.pxi||'';
          html+='<td style="padding:5px 8px;'+(isMulti?'border-bottom:1px dashed #e5e7eb':'')+'" rowspan="'+(isMulti?grp.length:1)+'">'+(payImgData?renderImgThumbs(payImgData,'width:36px;height:36px;object-fit:cover;border-radius:3px;cursor:pointer;margin:1px;'):'<span style="color:#d1d5db">-</span>')+'</td>';
          // 备注列
          var remarkText=firstRec.px||firstRec.pr_rk||'';
          html+='<td style="padding:5px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px;'+(isMulti?'border-bottom:1px dashed #e5e7eb':'')+'" title="'+esc(remarkText)+'" rowspan="'+(isMulti?grp.length:1)+'">'+(remarkText?'<span style="color:#6b7280">'+esc(remarkText)+'</span>':'<span style="color:#d1d5db">-</span>')+'</td>';
          html+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;'+(isMulti?'border-bottom:1px dashed #e5e7eb':'')+'" rowspan="'+(isMulti?grp.length:1)+'">';
          if(canModify){
            html+='<button type="button" onclick="editPayBatch(\''+bid+'\','+oid+')" style="margin-right:3px;padding:1px 6px;font-size:11px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;border-radius:3px;cursor:pointer">修改</button>';
            html+='<button type="button" onclick="withdrawPayBatch(\''+bid+'\','+oid+',function(){refreshPendingPaySection()})" style="margin-right:3px;padding:1px 6px;font-size:11px;border:1px solid #f59e0b;background:#fff;color:#f59e0b;border-radius:3px;cursor:pointer">撤回</button>';
          }else{
            html+='<span style="color:#9ca3af;font-size:11px">待审批</span>';
          }
          html+='</td>';
        }
        html+='</tr>';
      }
    }
    html+='</tbody></table></div>';
  }
  html=html.replace('id="pending-pay-count" style="background:#f59e0b;color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">0','id="pending-pay-count" style="background:#f59e0b;color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">'+batchCount);
  html+='</div>';
  return html;
}

// 刷新当前弹窗中的待审批收款记录区域（带重试机制）
function refreshPendingPaySection(retryCount){
  if(!retryCount)retryCount=0;
  if(retryCount>5)return; // 最多重试5次
  var ctx=window._currentPayModalContext;
  if(!ctx)return;
  var section=document.getElementById('pending-pay-records-section');
  if(section){
    section.outerHTML=buildPendingPaySection(ctx.oid,ctx.subIndices);
  }
  var rsection=document.getElementById('rejected-pay-records-section');
  if(rsection){
    rsection.outerHTML=buildRejectedPaySection(ctx.oid,ctx.subIndices);
  }
  if(section||rsection) return;
  // 元素还没渲染出来，稍后重试
  setTimeout(function(){ refreshPendingPaySection(retryCount+1); }, 100);
}

// 构建已驳回收款记录区域HTML
// oid: 母订单ID
// subIndices: 子订单索引数组（null/undefined=所有子订单）
function buildRejectedPaySection(oid, subIndices){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o)return '';
  var isAdmin=curUser&&curUser.role==='admin';
  var isFinance=curUser&&curUser.role==='finance';
  var canModify=isAdmin||isFinance||(o.sl===(curUser.name||''));
  var html='<div id="rejected-pay-records-section" style="margin-bottom:16px;border:1px solid #fecaca;border-radius:8px;overflow:hidden">';
  html+='<div style="background:#fef2f2;padding:8px 12px;font-weight:600;font-size:13px;border-bottom:1px solid #fecaca;display:flex;align-items:center;justify-content:space-between">';
  html+='<span>❌ 已驳回收款记录</span>';
  html+='<span id="rejected-pay-count" style="background:#ef4444;color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">0</span>';
  html+='</div>';
  // 收集已驳回记录
  var records=[];
  var items=o.items||[];
  var indices;
  if(!subIndices||subIndices.length===0){
    indices=[];
    for(var ni=0;ni<items.length;ni++)indices.push(ni);
  }else{
    indices=subIndices.slice();
  }
  for(var ri=0;ri<indices.length;ri++){
    var idx=indices[ri];
    var it=items[idx];
    if(!it)continue;
    var recs=it.pr_records||[];
    for(var rj=0;rj<recs.length;rj++){
      var rec=recs[rj];
      if(rec.prej&&!rec.pf){
        records.push({idx:idx,recIdx:rj,rec:rec,it:it});
      }
    }
  }
  // 按 batchId 分组计数
  var batchCount=0;
  if(records.length===0){
    html+='<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">暂无已驳回记录</div>';
  }else{
    // 按 batchId 分组
    var groups={};
    var groupOrder=[];
    for(var gi=0;gi<records.length;gi++){
      var r=records[gi];
      var bid=r.rec.batchId||('__noBatch_'+r.idx+'_'+r.recIdx);
      if(!groups[bid]){
        groups[bid]=[];
        groupOrder.push(bid);
      }
      groups[bid].push(r);
    }
    batchCount=groupOrder.length;
    html+='<div style="max-height:300px;overflow-y:auto">';
    html+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html+='<thead><tr style="background:#fef2f2;position:sticky;top:0">';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">子订单</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">编号</th>';
    html+='<th style="padding:5px 8px;text-align:right;font-weight:500">金额</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">驳回时间</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">方式</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">账号</th>';
    html+='<th style="padding:5px 8px;text-align:left;font-weight:500">驳回备注</th>';
    html+='<th style="padding:5px 8px;text-align:center;font-weight:500">操作</th>';
    html+='</tr></thead><tbody>';
    for(var gk=0;gk<groupOrder.length;gk++){
      var bid=groupOrder[gk];
      var grp=groups[bid];
      var firstRec=grp[0].rec;
      var ppmText=firstRec.ppm==='scan'?'扫码':(firstRec.ppm==='bank'?'对公':(firstRec.ppm||'-'));
      var payAccount=firstRec.ppa||'-';
      var totalAmt=0;
      for(var ti=0;ti<grp.length;ti++) totalAmt+=(grp[ti].rec.pm||0);
      totalAmt=Math.round(totalAmt*100)/100;
      var isMulti=grp.length>1;
      // 驳回时间：使用 pf_actual 字段（审批时设置），若无则用 pd
      var rejectTime=firstRec.prej_time||firstRec.pf_actual||firstRec.pd||'-';
      for(var ri2=0;ri2<grp.length;ri2++){
        var r2=grp[ri2];
        var subBn=r2.it.subBn||('子'+r2.idx);
        html+='<tr style="border-top:1px solid #fecaca">';
        // 子订单列
        html+='<td style="padding:5px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(subBn)+'">'+esc(subBn)+'</td>';
        // 编号列
        html+='<td style="padding:5px 8px;text-align:left;font-size:11px;color:#1d4ed8;'+(isMulti&&ri2===0?'border-bottom:1px dashed #fecaca':'')+'" '+(isMulti&&ri2===0?'rowspan="'+grp.length+'"':'')+'>'+(firstRec.payNo?esc(firstRec.payNo):'-')+'</td>';
        // 金额列
        if(ri2===0){
          if(isMulti){
            html+='<td style="padding:5px 8px;text-align:right;color:#ef4444;font-weight:700;border-bottom:1px dashed #fecaca" rowspan="'+grp.length+'">¥'+totalAmt.toFixed(2)+'</td>';
          }else{
            html+='<td style="padding:5px 8px;text-align:right;color:#ef4444;font-weight:500">¥'+(r2.rec.pm||0).toFixed(2)+'</td>';
          }
        }
        // 驳回时间列
        if(ri2===0){
          html+='<td style="padding:5px 8px;'+(isMulti?'border-bottom:1px dashed #fecaca':'')+'" rowspan="'+(isMulti?grp.length:1)+'">'+esc(rejectTime)+'</td>';
          html+='<td style="padding:5px 8px;'+(isMulti?'border-bottom:1px dashed #fecaca':'')+'" rowspan="'+(isMulti?grp.length:1)+'">'+esc(ppmText)+'</td>';
          html+='<td style="padding:5px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'+(isMulti?'border-bottom:1px dashed #fecaca':'')+'" title="'+esc(payAccount)+'" rowspan="'+(isMulti?grp.length:1)+'">'+esc(payAccount)+'</td>';
          // 驳回备注列
          var rejectRemark=firstRec.prej||'';
          html+='<td style="padding:5px 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;'+(isMulti?'border-bottom:1px dashed #fecaca':'')+'" title="'+esc(rejectRemark)+'" rowspan="'+(isMulti?grp.length:1)+'">'+(rejectRemark?'<span style="color:#dc2626">'+esc(rejectRemark)+'</span>':'<span style="color:#d1d5db">-</span>')+'</td>';
          // 操作列
          html+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;'+(isMulti?'border-bottom:1px dashed #fecaca':'')+'" rowspan="'+(isMulti?grp.length:1)+'">';
          if(canModify){
            html+='<button type="button" onclick="editRejectedPayBatch(\''+bid+'\','+oid+')" style="margin-right:3px;padding:1px 6px;font-size:11px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;border-radius:3px;cursor:pointer">修改</button>';
            html+='<button type="button" onclick="deleteRejectedPayBatch(\''+bid+'\','+oid+')" style="margin-right:3px;padding:1px 6px;font-size:11px;border:1px solid #ef4444;background:#fff;color:#ef4444;border-radius:3px;cursor:pointer">删除</button>';
          }else{
            html+='<span style="color:#9ca3af;font-size:11px">已驳回</span>';
          }
          html+='</td>';
        }
        html+='</tr>';
      }
    }
    html+='</tbody></table></div>';
  }
  html=html.replace('id="rejected-pay-count" style="background:#ef4444;color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">0','id="rejected-pay-count" style="background:#ef4444;color:#fff;font-size:11px;padding:1px 6px;border-radius:8px">'+batchCount);
  html+='</div>';
  return html;
}

// 点击子订单收款状态标签，弹出修改框
function openPayStatusModal(oid, subIdx, payStatus){
  var o=DB_ORDERS.find(function(x){return x.id===oid;});
  if(!o||!o.items||!o.items[subIdx]){toast('数据异常','error');return;}
  var it=o.items[subIdx];
  var payArr=it.pr_records||it.pr||[];
  // 找到对应状态的收款记录的batchId
  var targetBatchId=null;
  for(var k=0;k<payArr.length;k++){
    var rec=payArr[k];
    if(payStatus==='pending'&&!rec.pf&&!rec.prej){
      targetBatchId=rec.batchId;
      break;
    }
    if(payStatus==='rejected'&&rec.prej){
      targetBatchId=rec.batchId;
      break;
    }
  }
  if(!targetBatchId){
    // 旧数据没有batchId，使用editPayRecord（单条修改）
    for(var k=0;k<payArr.length;k++){
      var rec=payArr[k];
      if(payStatus==='pending'&&!rec.pf&&!rec.prej){
        editPayRecord(oid,subIdx,k);
        return;
      }
      if(payStatus==='rejected'&&rec.prej){
        editPayRecord(oid,subIdx,k);
        return;
      }
    }
    toast('未找到对应收款记录','error');
    return;
  }
  // 有batchId，使用整组修改
  if(payStatus==='pending'){
    editPayBatch(targetBatchId, oid);
  }else{
    editRejectedPayBatch(targetBatchId, oid);
  }
}

// 更新收款审批badge
function updatePayApprovalBadge(){
  // 委托给统一的updateApprovalBadge
  updateApprovalBadge();
}

// 出合同功能
var _contractLastPath='';
var _watermarkLastFolder='';

function loadContractPage(){
  loadContractAddresses();
  loadSalespersonList();
  loadLandlordList();
  loadAddressLandlordMapping();
  // 加载共享文件夹信息
  fetch('/api/contract/shared-info').then(function(r){return r.json();}).then(function(data){
    var info=document.getElementById('contract-shared-info');
    var path=document.getElementById('contract-shared-path');
    if(info&&path&&data.unc_hint){
      // 显示 UNC 网络路径 \\hostname\地址\地址材料
      path.textContent=data.unc_hint+'\\\u5730\u5740\u6750\u6599';
      info.style.display='block';
    }
  }).catch(function(){});
}

function openAddAddressModal(){
  showModal('添加地址',
    '<div class="form-group"><label>地址名称<span style="color:red">*</span></label>'
    +'<input type="text" id="add-addr-name" class="form-input" placeholder="如：铂瑞悦府2幢" style="width:100%"></div>'
    +'<div class="form-group"><label>上传地址资料（可多选）</label>'
    +'<input type="file" id="add-addr-files" class="form-input" accept="image/*,.pdf,.doc,.docx" style="width:100%;padding:8px" multiple>'
    +'<div style="font-size:11px;color:#888;margin-top:2px">支持图片、PDF、Word文档</div></div>',
    function(){
      var name=document.getElementById('add-addr-name').value.trim();
      var files=document.getElementById('add-addr-files').files;
      if(!name){toast('请输入地址名称','error');return false;}
      if(!files.length){toast('请上传地址资料','error');return false;}
      var fd=new FormData();
      fd.append('name',name);
      for(var i=0;i<files.length;i++)fd.append('files',files[i]);
      var btn=document.querySelector('#modal-confirm');
      var origText=btn.textContent;
      btn.disabled=true;
      btn.textContent='⏳ 提交中...';
      var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
      fetch('/api/contract/add-address',{method:'POST',headers:{'Authorization':'Bearer '+_token},body:fd})
        .then(function(r){return r.json()})
        .then(function(data){
          btn.disabled=false;
          btn.textContent=origText;
          if(data.ok){
            toast('✅ 地址已添加');
            closeModal();
            loadContractAddresses();
          }else{
            toast('❌ '+data.error,'error');
          }
        }).catch(function(e){
          btn.disabled=false;
          btn.textContent=origText;
          toast('❌ 请求失败: '+e.message,'error');
        });
      return false; // 阻止默认关闭
    }, false);
}

function loadSalespersonList(){
  var dl=document.getElementById('salesperson-list');
  if(!dl)return;
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  fetch('/api/contract/salesperson-list',{headers:{'Authorization':'Bearer '+_token}}).then(function(r){return r.json();}).then(function(data){
    dl.innerHTML='';
    if(data.list){
      data.list.forEach(function(name){
        var opt=document.createElement('option');
        opt.value=name;
        dl.appendChild(opt);
      });
    }
  }).catch(function(){});
}

function loadLandlordList(){
  var dl=document.getElementById('landlord-list');
  if(!dl)return;
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  fetch('/api/contract/landlord-list',{headers:{'Authorization':'Bearer '+_token}}).then(function(r){return r.json();}).then(function(data){
    dl.innerHTML='';
    if(data.list){
      data.list.forEach(function(name){
        var opt=document.createElement('option');
        opt.value=name;
        dl.appendChild(opt);
      });
    }
  }).catch(function(){});
}

function loadAddressLandlordMapping(){
  // 从Excel加载地址→默认出租方映射，存到全局变量
  window._addrLandlordMap={};
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  fetch('/api/contract/address-landlords',{headers:{'Authorization':'Bearer '+_token}}).then(function(r){return r.json();}).then(function(data){
    if(data.ok&&data.mapping)window._addrLandlordMap=data.mapping;
    // 映射加载完成后，如果已有选中的地址且出租方为空，自动填充
    var addr=document.getElementById('contract-address').value;
    var landlordInput=document.getElementById('contract-landlord');
    if(addr&&window._addrLandlordMap[addr]&&!landlordInput.value.trim()){
      landlordInput.value=window._addrLandlordMap[addr];
    }
  }).catch(function(){});
}

// 地址下拉变化时自动填充默认出租方
function onAddressChange(){
  var addr=document.getElementById('contract-address').value;
  var map=window._addrLandlordMap||{};
  var landlordInput=document.getElementById('contract-landlord');
  if(addr&&map[addr]){
    landlordInput.value=map[addr];
  }else if(addr){
    landlordInput.value='';
  }
}

function saveLandlordName(name){
  if(!name||!name.trim())return;
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  setTimeout(function(){
    fetch('/api/contract/landlord-save',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},
      body:JSON.stringify({name:name.trim()})
    }).then(function(r){return r.json();}).then(function(data){
      if(data.ok)loadLandlordList();
    }).catch(function(e){toast('保存出租方失败','error');});
  },500);
}

function autoFillWatermarkText(){
  var company=document.getElementById('contract-company').value.trim();
  var wmInput=document.getElementById('watermark-text-input');
  if(!company)return;
  // 如果水印输入框为空，或者内容看起来是之前自动填充的（以"仅供 "开头、含" 工商使用"），则刷新
  var val=wmInput.value.trim();
  if(!val||/^仅供 .+ 工商使用$/.test(val)){
    wmInput.value='仅供 '+company+' 工商使用';
  }
}

function loadContractAddresses(){
  var sel=document.getElementById('contract-address');
  if(!sel)return;
  var prevVal=sel.value;
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  fetch('/api/contract/address-folders',{headers:{'Authorization':'Bearer '+_token}}).then(function(r){return r.json();}).then(function(data){
    sel.innerHTML='<option value="">-- 请选择地址 --</option>';
    data.forEach(function(f){
      sel.innerHTML+='<option value="'+escHtml(f)+'">'+escHtml(f)+'</option>';
    });
    // 恢复之前的选中项
    if(prevVal){sel.value=prevVal;}
  }).catch(function(e){
    sel.innerHTML='<option value="">\u52a0\u8f7d\u5931\u8d25: '+e.message+'</option>';
  });
}

function genContractWatermark(){
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  var company=document.getElementById('contract-company').value.trim();
  var folder=document.getElementById('contract-address').value;
  var room=document.getElementById('contract-room').value.trim();
  var salesperson=document.getElementById('contract-salesperson').value.trim();
  var landlord=document.getElementById('contract-landlord').value.trim();
  var btn=document.getElementById('btn-contract-gen');
  var result=document.getElementById('contract-result');
  var error=document.getElementById('contract-error');
  result.style.display='none';
  error.style.display='none';

  if(!company){toast('请输入承租方名称');return;}
  if(!folder){toast('请选择地址');return;}
  if(!room){toast('请输入房间号');return;}
  if(!salesperson){toast('请输入业务员名称');return;}
  if(!landlord){toast('请输入出租方');return;}

  btn.disabled=true;
  btn.textContent='⏳ 生成中...';
  fetch('/api/contract/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},
    body:JSON.stringify({company_name:company,folder_name:folder,room_number:room,salesperson:salesperson,landlord:landlord})
  }).then(function(r){return r.json();}).then(function(data){
    btn.disabled=false;
    btn.textContent='📄 生成合同';
    if(data.ok){
      _contractLastPath=data.path;
      document.getElementById('contract-result-fields').innerHTML=data.fields.join('<br>');
      result.style.display='block';

      // 显示文件夹 UNC 路径
      if(data.unc_folder){
        var uncDiv=document.getElementById('contract-result-path');
        var uncEl=document.getElementById('contract-result-path-text');
        if(uncDiv&&uncEl){
          uncEl.textContent=data.unc_folder;
          uncDiv.style.display='block';
        }
      }

      toast('✅ 合同已生成');
    }else{
      document.getElementById('contract-error-text').textContent=data.error||'生成失败';
      error.style.display='block';
    }
  }).catch(function(e){
    btn.disabled=false;
    btn.textContent='📄 生成合同';
    toast('生成合同失败: '+ (e.message||e),'error');
    document.getElementById('contract-error-text').textContent='请求失败: '+e.message;
    document.getElementById('contract-error').style.display='block';
  });
}

// 重置出合同表单
function resetContractForm(){
  document.getElementById('contract-company').value='';
  document.getElementById('contract-room').value='';
  document.getElementById('contract-salesperson').value='';
  document.getElementById('contract-landlord').value='';
  document.getElementById('contract-address').value='';
  document.getElementById('contract-result').style.display='none';
  document.getElementById('contract-error').style.display='none';
  document.getElementById('contract-result-path').style.display='none';
  document.getElementById('watermark-result').style.display='none';
  document.getElementById('watermark-error').style.display='none';
  document.getElementById('watermark-result-path').style.display='none';
  document.getElementById('btn-contract-gen').disabled=false;
  document.getElementById('btn-contract-gen').textContent='📄 生成合同';
  document.getElementById('btn-watermark').disabled=false;
  document.getElementById('btn-watermark').textContent='💧 开始打水印';
  // 清空上传的文件和水印文字输入
  var scanInput=document.getElementById('contract-scan');
  if(scanInput)scanInput.value='';
  var wmText=document.getElementById('watermark-text-input');
  if(wmText)wmText.value='';
  _contractLastPath='';
  _watermarkLastFolder='';
  autoFillWatermarkText();
  toast('🔄 已重置');
}

// 复制文本到剪贴板（兼容 HTTP 环境）
function copyToClipboard(text){
  var ta=document.createElement('textarea');
  ta.value=text;
  ta.style.position='fixed';
  ta.style.opacity='0';
  document.body.appendChild(ta);
  ta.select();
  try{document.execCommand('copy');return true;}catch(e){return false;}
  finally{document.body.removeChild(ta);}
}

function openContractFolder(){
  var pathEl=document.getElementById('contract-result-path-text');
  if(pathEl&&pathEl.textContent){
    copyToClipboard(pathEl.textContent);
    toast('✅ 已复制到剪贴板');
  }
}

function doWatermark(){
  var folder=document.getElementById('contract-address').value;
  var fileInput=document.getElementById('contract-scan');
  var files=fileInput.files;
  var watermarkText=document.getElementById('watermark-text-input').value.trim();
  var btn=document.getElementById('btn-watermark');
  var result=document.getElementById('watermark-result');
  var error=document.getElementById('watermark-error');
  result.style.display='none';
  error.style.display='none';

  if(!watermarkText){toast('请输入水印文字');return;}
  if(!files.length&&!folder){toast('请上传照片或选择地址文件夹');return;}

  btn.disabled=true;
  btn.textContent='⏳ 处理中...';
  var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
  var fd=new FormData();
  fd.append('watermark_text',watermarkText);
  if(folder)fd.append('folder_name',folder);
  // 如果出合同那边有填写信息，一起传给水印（让水印存到合同文件夹）
  var company=document.getElementById('contract-company').value.trim();
  var room=document.getElementById('contract-room').value.trim();
  if(company)fd.append('company_name',company);
  if(room)fd.append('room_number',room);
  // 打包PDF选项
  var pdfToggle=document.getElementById('wm-pdf-toggle');
  if(pdfToggle&&!pdfToggle.checked)fd.append('no_pdf','1');
  // 上传多张照片
  for(var i=0;i<files.length;i++){
    fd.append('file',files[i]);
  }
  // 读取水印参数（从 settings 面板获取）
  var fontSize=document.getElementById('wm-font-size');
  var wmColor=document.getElementById('wm-color');
  var wmAlpha=document.getElementById('wm-alpha');
  var wmAngle=document.getElementById('wm-angle');
  if(fontSize)fd.append('font_size',fontSize.value);
  if(wmColor)fd.append('color',wmColor.value);
  if(wmAlpha){
    var alphaVal=Math.round(wmAlpha.value/100*255);
    if(alphaVal<10)alphaVal=10;
    fd.append('alpha',alphaVal);
  }
  if(wmAngle)fd.append('angle',wmAngle.value);
  // 间距参数（等值水平/垂直）
  var spacingEl=document.getElementById('wm-spacing');
  var spacingVal=spacingEl?spacingEl.value:80;
  fd.append('spacing_x',spacingVal);
  fd.append('spacing_y',spacingVal);
  // 业务员名称
  var salesperson=document.getElementById('contract-salesperson');
  if(salesperson&&salesperson.value.trim())fd.append('salesperson',salesperson.value.trim());
  else{toast('请输入业务员名称');btn.disabled=false;btn.textContent='💧 开始打水印';return;}
  fetch('/api/contract/watermark',{
    method:'POST',
    headers:{'Authorization':'Bearer '+_token},
    body:fd
  }).then(function(r){return r.json();}).then(function(data){
    btn.disabled=false;
    btn.textContent='💧 开始打水印';
    if(data.ok){
      _watermarkLastFolder=data.folder;
      document.getElementById('watermark-result-msg').textContent='✅ 水印已完成，共处理 '+data.count+' 张图片';
      var html='';
      data.files.forEach(function(f){html+='<div>📄 '+f+'</div>';});
      // 如果有PDF，显示PDF链接
      if(data.pdf_name){
        html+='<div style="margin-top:8px;padding:6px 10px;background:#fef3c7;border-radius:4px;font-weight:600">📕 水印汇总PDF：<span style="color:#d97706">'+data.pdf_name+'</span></div>';
      }
      document.getElementById('watermark-result-files').innerHTML=html;
      // 显示网络路径（点按钮复制）
      fetch('/api/contract/open-folder',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},body:JSON.stringify({path:data.folder})})
        .then(function(r){return r.json()}).then(function(d){
          if(d.unc_path){
            var uncPath=d.unc_path;
            var uncDiv=document.getElementById('watermark-result-path');
            var uncText=document.getElementById('watermark-result-path-text');
            if(uncDiv&&uncText){
              uncText.textContent=uncPath;
              uncDiv.style.display='block';
            }
          }
        }).catch(function(){});
      result.style.display='block';
      toast('✅ 水印处理完成');
    }else{
      document.getElementById('watermark-error-text').textContent=data.error||'处理失败';
      error.style.display='block';
    }
  }).catch(function(e){
    btn.disabled=false;
    btn.textContent='💧 开始打水印';
    toast('操作失败: '+ (e.message||e),'error');
    document.getElementById('watermark-error-text').textContent='请求失败: '+e.message;
    document.getElementById('watermark-error').style.display='block';
  });
}

function openWatermarkFolder(){
  var pathEl=document.getElementById('watermark-result-path-text');
  if(pathEl&&pathEl.textContent){
    copyToClipboard(pathEl.textContent);
    toast('\u2705 \u5df2\u590d\u5236\u5230\u526a\u8d34\u677f');
  }else if(_watermarkLastFolder){
    var _token='';try{var _s=JSON.parse(localStorage.getItem('crm_login'));if(_s&&_s.token)_token=_s.token}catch(e){}
    fetch('/api/contract/open-folder',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_token},body:JSON.stringify({path:_watermarkLastFolder})})
      .then(function(r){return r.json()}).then(function(d){
        var p=d.unc_path||d.path;
        copyToClipboard(p);
        toast('\u2705 \u5df2\u590d\u5236\u5230\u526a\u8d34\u677f');
      }).catch(function(){toast('\u2705 \u5df2\u590d\u5236: '+_watermarkLastFolder);});
  }
}

console.log('\ud83c\udde8\ud83c\uddf3 \u5730\u5740\u6302\u9760\u7ba1\u7406\u7cfb\u7edf v2.0 \u5df2\u52a0\u8f7d | \u6570\u636e:'+DB_ADDRESS.length+'\u5730\u5740,'+DB_ORDERS.length+'\u8ba2\u5355,'+DB_CUSTOMERS.length+'\u5ba2\u6237');

// ========== 提醒面板：切换 ==========
function toggleReminderPanel(){
  var p=document.getElementById('reminder-panel');
  if(!p)return;
  if(p.style.display==='block'){p.style.display='none';return;}
  loadReminders();p.style.display='block';
}
// ========== 加载提醒列表 ==========
function loadReminders(){
  var reminders=[];
  // 1. 待审批的收款
  var allPay=DB_ORDERS.reduce(function(a,o){
    if(o.items)o.items.forEach(function(it){
      if(it.pr_records)it.pr_records.forEach(function(r){
        if(r.rid&&(!r.pf||r.prej))a.push({oid:o.id,bn:o.bn,addr:it.addr,rid:r.rid,pm:r.pm,type:'pay',ts:r.ts||o.ts});
      });
    });
    return a;
  },[]);
  allPay.forEach(function(r){reminders.push({key:'pay_'+r.oid+'_'+r.rid,oid:r.oid,bn:r.bn,addr:r.addr,text:'收款审批：'+r.addr+' ¥'+(r.pm||0),type:'pay'});});
  // 2. 待审批的支出
  var allExp=DB_ORDERS.reduce(function(a,o){
    if(o.items)o.items.forEach(function(it){
      if(it.ex_records)it.ex_records.forEach(function(r){
        if(r.rid&&(!r.xf||r.prej))a.push({oid:o.id,bn:o.bn,addr:it.addr,rid:r.rid,xm:r.xm,type:'exp',ts:r.ts||o.ts});
      });
    });
    return a;
  },[]);
  allExp.forEach(function(r){reminders.push({key:'exp_'+r.oid+'_'+r.rid,oid:r.oid,bn:r.bn,addr:r.addr,text:'支出审批：'+r.addr+' ¥'+(r.xm||0),type:'exp'});});
  // 3. 待审批的开票
  var allInv=(DB_INVOICES||[]).filter(function(r){return r.status==='pending';});
  allInv.forEach(function(r){reminders.push({key:'inv_'+r.id,oid:r.orderId,bn:(DB_ORDERS.find(function(o){return o.id===r.orderId})||{}).bn,text:'开票审批：'+(r.title||r.invTitle||'开票申请'),type:'inv'});});
  // 渲染
  renderReminderList(reminders);
}
// ========== 渲染提醒列表 ==========
function renderReminderList(reminders){
  var list=document.getElementById('reminder-list');
  if(!list)return;
  var readKeys=JSON.parse(localStorage.getItem('_reminderRead')||'[]');
  var badge=document.getElementById('reminder-badge');
  var unreadCount=reminders.filter(function(r){return readKeys.indexOf(r.key)===-1;}).length;
  if(badge)badge.textContent=unreadCount>0?unreadCount:'';
  if(reminders.length===0){
    list.innerHTML='<div style="padding:20px;text-align:center;color:#999">暂无待办提醒</div>';
    return;
  }
  var html='';
  reminders.forEach(function(r){
    var isRead=readKeys.indexOf(r.key)!==-1;
    html+='<div class="reminder-item'+(isRead?' read':'')+'" onclick="reminderClick(\''+r.key+'\',\'approval\',\''+r.type+'\',this)">'
      +'<div class="reminder-icon">'+(r.type==='pay'?'💰':r.type==='exp'?'💳':'📄')+'</div>'
      +'<div class="reminder-body"><div class="reminder-text">'+r.text+'</div>'
      +(r.bn?'<div class="reminder-bn">#'+r.bn+'</div>':'')
      +'</div></div>';
  });
  list.innerHTML=html;
}
// 点击提醒：标记已读 + 跳转
function reminderClick(key, page, tab, el){
  var readKeys=JSON.parse(localStorage.getItem('_reminderRead')||'[]');
  if(readKeys.indexOf(key)===-1)readKeys.push(key);
  localStorage.setItem('_reminderRead',JSON.stringify(readKeys));
  if(el)el.classList.add('read');
  document.getElementById('reminder-panel').style.display='none';
  // 跳转到对应页面
  if(page==='approval'){
    if(curRole==='sales'){
      // 销售无权访问审批中心，改为跳转到订单管理并搜索对应订单
      navigateTo('orders');
      // 从key中解析订单ID：key格式 pay_oid_rj_rk 或 exp_oid_rj_rl
      var parts=key.split('_');
      if(parts.length>=2){
        var oid=parseInt(parts[1]);
        // 根据订单ID获取业务编号
        var order=DB_ORDERS.find(function(o){return o.id===oid});
        if(order&&order.bn){
          var searchInput=$('order-search');
          if(searchInput){searchInput.value=order.bn;renderOrdersTable();}
          toast('已跳转至订单：'+order.bn);
        }else{
          toast('已跳转至订单管理');
        }
      }
    }else{
      navigateTo('approval');
      var cards=document.querySelectorAll('.approval-stat-cards .stat-card');
      for(var ti=0;ti<cards.length;ti++){
        if(cards[ti].getAttribute('onclick')&&cards[ti].getAttribute('onclick').indexOf("'"+tab+"'")!==-1){
          cards[ti].click();break;
        }
      }
    }
  }
}
document.addEventListener('click',function(e){
  var p=document.getElementById('reminder-panel'),t=document.getElementById('reminder-toggle');
  if(p&&t&&!p.contains(e.target)&&!t.contains(e.target))p.style.display='none';
});
setTimeout(loadReminders,500);