# 示例角色包（空壳）

这个目录**不是运行时数据**，而是"角色包长什么样"的模板：

```
character.json              角色清单（id/name/版本）
persona.md                  人格卡（你自己写）
memory/memory-card.json     记忆卡空壳（records 为空）
memory/memory-inbox.jsonl   待摄取事件（空文件）
bili/                       B站 行为账本（运行时自动生成，不要提交）
```

真正跑起来之后，这些文件在：

| 平台 | 位置 |
| --- | --- |
| Windows | `%USERPROFILE%\.dsh\surfcore\characters\<id>\` |
| 可用环境变量覆盖 | `DSH_HOME` |

> ⚠️ **记忆卡不要手写**：`records` 由插件维护（摄取 → 衰减 → 压缩），手改会被下一次整理覆盖。
> 想给角色"预置记忆"，写进 `memory-inbox.jsonl`（每行一条事件），让插件自己摄取。
>
> 仓库里**不包含任何真实记忆、群号、群友名单**——这些永远只在你自己的机器上。
