#!/usr/bin/env node
/**
 * 贴吧工具链（BDUSS 登录，手机版 / app 接口）。
 *
 * 用法：
 *   node tieba.mjs status
 *   node tieba.mjs verify
 *   node tieba.mjs feed [--sort hot|time]
 *   node tieba.mjs thread --id <thread_id> [--page 1] [--order asc|desc|hot]
 *   node tieba.mjs floor --thread <thread_id> --post <post_id>
 *   node tieba.mjs replyme [--page 1]
 *   node tieba.mjs reply --thread <id> --msg "…"
 *   node tieba.mjs reply --post <post_id> --msg "…"
 *   node tieba.mjs post --title "标题" --msg "正文" [--bar 抓虾吧]
 *   node tieba.mjs like --thread <id> [--post <post_id>]
 *   node tieba.mjs unlike --thread <id> [--post <post_id>]
 *   node tieba.mjs delete-thread --id <thread_id>
 *   node tieba.mjs delete-post --id <post_id>
 *   node tieba.mjs rename --name "新昵称"
 *   node tieba.mjs sign [--bar 抓虾吧]
 *   node tieba.mjs summary --note "这次做了什么"
 *
 * 任何命令都可以加 `--json` 输出原始结构化结果。
 * 内容只支持纯文本（≤1000 字，标题 ≤30 字），禁止 Markdown / 链接。
 */
import { tiebaAction } from '../lib/tieba.js';

const argv = process.argv.slice(2);
const cmd = argv[0] ?? 'status';
const flags = {};
for (let i = 1; i < argv.length; i += 1) {
  const token = argv[i];
  if (!token.startsWith('--')) continue;
  const key = token.slice(2);
  const next = argv[i + 1];
  if (next && !next.startsWith('--')) { flags[key] = next; i += 1; }
  else flags[key] = true;
}

const json = flags.json === true;
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

function output(value) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function printFeed(result) {
  console.log(`贴吧帖子列表（${result.sort === 'time' ? '最新' : '热门'} · 共 ${result.total ?? result.threads.length} 条，本次看 ${result.shown ?? result.threads.length} 条 · 已按口味排序）`);
  for (const thread of result.threads) {
    const taste = thread.taste ?? {};
    const scoreText = taste.score ? ` 口味 ${taste.score > 0 ? '+' : ''}${taste.score}` : '';
    console.log(`- [${thread.id}] ${thread.title || '（无标题）'}${scoreText}`);
    console.log(`  作者 ${thread.author || '—'} · 回复 ${thread.replyNum} · 浏览 ${thread.viewNum} · 赞 ${thread.agreeNum}`);
    if (thread.abstract) console.log(`  摘要：${thread.abstract.slice(0, 160)}`);
    if (taste.liked?.length) console.log(`  命中：${taste.liked.join('、')}`);
    if (taste.disliked?.length) console.log(`  ⚠️ 不爱看：${taste.disliked.join('、')}`);
    console.log(`  ${thread.url}`);
  }
}

function printThread(result) {
  const thread = result.thread;
  console.log(`# ${thread.title || '（无标题）'}  [${thread.id}]`);
  console.log(`楼主：${thread.content}`);
  console.log(`赞 ${thread.agreeNum} · 第 ${thread.page.current}/${thread.page.total} 页`);
  for (const post of thread.posts) {
    console.log(`\n${post.floor}楼 · post_id ${post.id} · 赞 ${post.agreeNum}`);
    console.log(post.content);
    for (const sub of post.subPosts) {
      console.log(`  ↳ post_id ${sub.id} · 赞 ${sub.agreeNum}：${sub.content}`);
    }
  }
  console.log(`\n打开：${thread.url}`);
}

function printReplies(result) {
  console.log(`回复我的（${result.replies.length} 条）`);
  for (const item of result.replies) {
    console.log(`${item.unread ? '● ' : '○ '}${item.title || ''}  thread ${item.threadId} / post ${item.postId}`);
    console.log(`  内容：${item.content}`);
    if (item.quoteContent) console.log(`  引用：${item.quoteContent}`);
    console.log(`  ${item.url}`);
  }
}

try {
  if (cmd === 'feed') {
    const result = await tiebaAction('feed', { sort: flags.sort });
    json ? output(result) : printFeed(result);
  } else if (cmd === 'thread') {
    const id = flags.id ?? flags.thread ?? argv[1];
    if (!id) fail('thread 需要 --id <thread_id>');
    const result = await tiebaAction('thread', { id, page: Number(flags.page) || 1, order: flags.order });
    json ? output(result) : printThread(result);
  } else if (cmd === 'floor') {
    const threadId = flags.thread ?? flags.threadId;
    const postId = flags.post ?? flags.postId;
    if (!threadId || !postId) fail('floor 需要 --thread <thread_id> --post <post_id>');
    const result = await tiebaAction('floor', { threadId, postId });
    json ? output(result) : output(result);
  } else if (cmd === 'replyme') {
    const result = await tiebaAction('replyme', { page: Number(flags.page) || 1 });
    json ? output(result) : printReplies(result);
  } else if (cmd === 'reply') {
    const result = await tiebaAction('reply', {
      threadId: flags.thread ?? flags.threadId,
      postId: flags.post ?? flags.postId,
      content: flags.msg ?? flags.content ?? '',
    });
    json ? output(result) : console.log(`✓ 已评论：${result.url}`);
  } else if (cmd === 'post') {
    const result = await tiebaAction('post', {
      title: flags.title ?? '',
      content: flags.msg ?? flags.content ?? '',
      bar: flags.bar,
    });
    json ? output(result) : console.log(`✓ 已发帖：${result.url}`);
  } else if (cmd === 'like' || cmd === 'unlike') {
    const result = await tiebaAction(cmd, {
      threadId: flags.thread ?? flags.threadId,
      postId: flags.post ?? flags.postId,
    });
    json ? output(result) : console.log(`✓ 已${cmd === 'like' ? '点赞' : '取消点赞'}（thread ${result.threadId}${result.postId ? ` / post ${result.postId}` : ''}）`);
  } else if (cmd === 'delete-thread') {
    const id = flags.id ?? flags.thread ?? argv[1];
    if (!id) fail('delete-thread 需要 --id <thread_id>');
    const result = await tiebaAction('delete-thread', { id });
    json ? output(result) : console.log(`✓ 已删除帖子 ${id}`);
  } else if (cmd === 'delete-post') {
    const id = flags.id ?? flags.post ?? argv[1];
    if (!id) fail('delete-post 需要 --id <post_id>');
    const result = await tiebaAction('delete-post', { id });
    json ? output(result) : console.log(`✓ 已删除评论 ${id}`);
  } else if (cmd === 'rename') {
    const result = await tiebaAction('rename', { name: flags.name ?? '' });
    json ? output(result) : console.log(`✓ 昵称已改为 ${result.name}`);
  } else if (cmd === 'sign') {
    const result = await tiebaAction('sign', { bar: flags.bar });
    if (json) output(result);
    else {
      for (const item of result.results ?? []) {
        console.log(item.ok ? `✓ ${item.kw} 已签到${item.count != null ? `（第 ${item.count} 天）` : ''}` : `✗ ${item.kw} 签到失败：${item.msg || item.error || ''}`);
      }
    }
  } else if (cmd === 'summary') {
    const result = await tiebaAction('summary', { note: flags.note ?? '' });
    json ? output(result) : console.log('✓ 已记录这次贴吧行为摘要');
  } else if (cmd === 'status') {
    const result = await tiebaAction('status');
    json ? output(result) : output(result);
  } else if (cmd === 'verify') {
    const result = await tiebaAction('verify');
    json ? output(result) : console.log(`✓ 登录态有效${result.user ? `：${result.user}` : ''}`);
  } else {
    fail(`未知命令：${cmd}（可用：status / verify / feed / thread / floor / replyme / reply / post / like / unlike / sign / delete-thread / delete-post / rename / summary）`);
  }
} catch (error) {
  fail(String(error?.message ?? error));
}
